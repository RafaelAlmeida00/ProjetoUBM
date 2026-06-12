-- Migração 0010 — notificação in-app + preferências + outbox de e-mail + erasure LGPD
-- (architecture.md §3.4/§6.2; ADR-0008/ADR-0007; RN18/RN19; CA13/CA18-CA22/CA24)

-- Notificação in-app (Realtime herda esta RLS)
create table public.notificacao (
  id              uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references auth.users(id) on delete cascade,
  tipo            tipo_notificacao not null,
  payload         jsonb not null default '{}',
  recurso_tipo    text, recurso_id uuid,
  lida_em         timestamptz,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index notificacao_destinatario_idx on public.notificacao (destinatario_id, lida_em) where deleted_at is null;
alter table public.notificacao enable row level security; alter table public.notificacao force row level security;
create policy notificacao_select on public.notificacao for select to authenticated
  using ((destinatario_id = (select auth.uid()) or (select public.is_admin())) and deleted_at is null);
create policy notificacao_update_own on public.notificacao for update to authenticated
  using (destinatario_id = (select auth.uid())) with check (destinatario_id = (select auth.uid()));

-- Preferência de e-mail por tipo (escrita GATED por verificação — CA24, recurso != perfil)
create table public.notificacao_preferencia (
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo    tipo_notificacao not null,
  email   boolean not null default true,
  primary key (user_id, tipo)
);
alter table public.notificacao_preferencia enable row level security; alter table public.notificacao_preferencia force row level security;
create policy npref_select on public.notificacao_preferencia for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy npref_write on public.notificacao_preferencia for all to authenticated
  using (user_id = (select auth.uid()) and (select public.esta_verificado()))
  with check (user_id = (select auth.uid()) and (select public.esta_verificado()));

-- Opt-out global de e-mail (também gated)
create table public.email_optout_global (
  user_id uuid primary key references auth.users(id) on delete cascade,
  optout  boolean not null default false
);
alter table public.email_optout_global enable row level security; alter table public.email_optout_global force row level security;
create policy optout_select on public.email_optout_global for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy optout_write on public.email_optout_global for all to authenticated
  using (user_id = (select auth.uid()) and (select public.esta_verificado()))
  with check (user_id = (select auth.uid()) and (select public.esta_verificado()));

-- Fila de e-mail (schema privado, server-only)
create schema if not exists fila;
revoke all on schema fila from anon, authenticated;
grant usage on schema fila to service_role;
create table fila.email_outbox (
  id                   uuid primary key default gen_random_uuid(),
  chave_idempotencia   text not null unique,          -- dedup duro (CA22)
  destinatario_email   text not null,
  template             text not null,
  dados                jsonb not null default '{}',
  status               text not null default 'pendente' check (status in ('pendente','enviado','falhou')),
  tentativas           int not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  enviado_em           timestamptz
);
alter table fila.email_outbox enable row level security; alter table fila.email_outbox force row level security;

-- quer_email: respeita opt-out global + preferência por tipo (default true)
create or replace function public.quer_email(p_user uuid, p_tipo tipo_notificacao)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select not optout from public.email_optout_global where user_id = p_user), true)
     and coalesce((select email from public.notificacao_preferencia where user_id = p_user and tipo = p_tipo), true);
$$;

-- criar_notificacao: in-app + (se aplicável) enfileira e-mail idempotente. Server-only (evita spoofing).
create or replace function public.criar_notificacao(
  p_dest uuid, p_tipo tipo_notificacao, p_payload jsonb default '{}',
  p_chave text default null, p_email_to text default null, p_template text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notificacao (destinatario_id, tipo, payload) values (p_dest, p_tipo, coalesce(p_payload, '{}'));
  if p_chave is not null and p_email_to is not null and public.quer_email(p_dest, p_tipo) then
    insert into fila.email_outbox (chave_idempotencia, destinatario_email, template, dados)
    values (p_chave, p_email_to, coalesce(p_template, p_tipo::text), coalesce(p_payload, '{}'))
    on conflict (chave_idempotencia) do nothing;     -- idempotente (CA22)
  end if;
end; $$;
grant execute on function public.criar_notificacao(uuid, tipo_notificacao, jsonb, text, text, text) to service_role;
grant execute on function public.quer_email(uuid, tipo_notificacao) to service_role;

-- Erasure LGPD: anonimiza PII nas tabelas vivas E dentro do log de auditoria (CA19/CA20; RN18). Só admin.
create or replace function public.erasure_titular(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  update public.perfil set nome_publico = '[removido]', avatar_url = null where user_id = p_user_id;
  update auth.users set email = 'removed-' || p_user_id::text || '@example.invalid' where id = p_user_id;
  update public.notificacao set payload = '{}'::jsonb where destinatario_id = p_user_id;
  update audit.record_version
     set record     = record     - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url',
         old_record = old_record - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url'
   where actor_id = p_user_id or record_id = p_user_id;
  insert into audit.record_version (tabela, record_id, op, record)
    values ('public.perfil', p_user_id, 'ERASURE', jsonb_build_object('user_id', p_user_id));
end; $$;
grant execute on function public.erasure_titular(uuid) to authenticated;
