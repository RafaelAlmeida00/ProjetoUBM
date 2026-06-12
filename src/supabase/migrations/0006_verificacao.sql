-- Migração 0006 — verificação de conta por token (architecture.md §3.3/§8; RN24; security.md RS7-RS18)
-- Token bruto só viaja no e-mail; o banco guarda SÓ o sha256(token). Uso único + expiração + rate-limit.

create table public.verificacao_token (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token_hash bytea not null,                 -- sha256(token) — segredo nunca em claro (RS8)
  expira_em  timestamptz not null,           -- expiração curta (RS9)
  usado_em   timestamptz,                    -- uso único (RS10): != null => recusado
  created_at timestamptz not null default now()
);
create unique index verificacao_token_hash_uniq on public.verificacao_token (token_hash);
create index verificacao_token_user_idx on public.verificacao_token (user_id) where usado_em is null;

-- server-only: enable+force + nenhuma policy + privilégios revogados (RPCs definer fazem tudo)
alter table public.verificacao_token enable row level security;
alter table public.verificacao_token force  row level security;
revoke all on public.verificacao_token from anon, authenticated;

-- Emite token p/ o PRÓPRIO usuário: rate-limit, invalida pendentes, guarda só o hash. Retorna o token BRUTO.
create or replace function public.emitir_token_verificacao()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_token text;
  v_count int;
begin
  if v_uid is null then raise exception 'sessao necessaria'; end if;
  select count(*) into v_count from public.verificacao_token
    where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_count >= 5 then raise exception 'limite de emissao excedido'; end if;   -- RS12 rate-limit
  update public.verificacao_token set usado_em = now()
    where user_id = v_uid and usado_em is null;                                -- RS14 invalida pendentes
  -- >=128 bits via 2x gen_random_uuid (core, CSPRNG); evita dependência de pgcrypto
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.verificacao_token (user_id, token_hash, expira_em)
    values (v_uid, sha256(convert_to(v_token, 'UTF8')), now() + interval '60 minutes');
  return v_token;
end; $$;

-- Consome o token: confere hash + não-usado + não-expirado; marca uso e verifica a conta. Resposta genérica.
create or replace function public.verificar_conta(p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  update public.verificacao_token t set usado_em = now()
    where t.token_hash = sha256(convert_to(p_token, 'UTF8'))
      and t.usado_em is null and t.expira_em > now()
    returning t.user_id into v_uid;
  if v_uid is null then return false; end if;   -- inválido/expirado/usado => genérico (anti-enumeração RS11)
  update public.perfil set verificado_em = now(), updated_at = now() where user_id = v_uid;
  return true;
end; $$;

grant execute on function public.emitir_token_verificacao() to authenticated;
grant execute on function public.verificar_conta(text) to anon, authenticated;
