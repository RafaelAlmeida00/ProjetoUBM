-- Migração 0011 — empresa canônica + normalização IMMUTABLE + dedup base (architecture.md §; ADR-0004)
-- Normalização por translate() (IMMUTABLE de verdade, portável PGlite/Supabase — NÃO unaccent).

create extension if not exists pg_trgm;

-- Normaliza: minúsculas + remove acentos + tira sufixo societário (por token, no fim) + colapsa pontuação.
create or replace function public.normalizar_empresa(p text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
           regexp_replace(
             translate(lower(coalesce(p, '')),
                       'áàâãäéèêëíìîïóòôõöúùûüçñ',
                       'aaaaaeeeeiiiiooooouuuucn'),
             '[[:space:]]+(ltda|ltda\.|s\.?a\.?|s/a|sa|eireli|mei|epp|me|slu|cia|cia\.|s/s)[[:space:].]*$',
             '', 'g'
           ),
           '[^a-z0-9]+', ' ', 'g'
         ))
$$;

create table public.empresa (
  id               uuid primary key default gen_random_uuid(),
  nome_canonico    text not null,                  -- grafia de exibição (1ª cadastrada) — RN4
  nome_normalizado text generated always as (public.normalizar_empresa(nome_canonico)) stored,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by       uuid references auth.users(id),
  merged_into      uuid references public.empresa(id),  -- canonicalização (perdedora -> vencedora)
  constraint empresa_nome_nao_vazio check (length(btrim(nome_canonico)) > 0)
);
-- unicidade canônica entre VIVAS e NÃO-fundidas (RN2/RN3); libera nome após delete/merge (A4)
create unique index empresa_norm_uniq on public.empresa (nome_normalizado)
  where deleted_at is null and merged_into is null;
create index empresa_nome_trgm on public.empresa using gin (nome_normalizado gin_trgm_ops);

alter table public.empresa enable row level security;
alter table public.empresa force  row level security;
-- catálogo: leitura por AUTENTICADO + admin (anon lê só via RPC buscar_empresa — reconciliação G2/RS-A*)
create policy empresa_select on public.empresa for select to authenticated
  using ((deleted_at is null and merged_into is null) or (select public.is_admin()));
create policy empresa_insert on public.empresa for insert to authenticated
  with check (created_by = (select auth.uid()));          -- criar = autenticado (A1)
create policy empresa_update_admin on public.empresa for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));  -- editar nome = admin (A5)
create policy empresa_delete_admin on public.empresa for delete to authenticated
  using ((select public.is_admin()));

create trigger zzz_audit after insert or update or delete on public.empresa
  for each row execute function audit.gravar_versao();

-- FK formal membro_empresa -> empresa (RN13/CA12); aditiva (sem cascade)
alter table public.membro_empresa
  add constraint membro_empresa_empresa_fk foreign key (empresa_id) references public.empresa(id);

-- estende a allowlist de restore com 'empresa' (aditivo sobre a 0009)
create or replace function public.restore_record(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  if p_tabela = 'curso' then
    update public.curso set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.curso', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  elsif p_tabela = 'empresa' then
    update public.empresa set deleted_at = null, deleted_by = null where id = p_id and merged_into is null;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.empresa', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  else
    raise exception 'tabela nao restauravel: %', p_tabela;
  end if;
end; $$;
