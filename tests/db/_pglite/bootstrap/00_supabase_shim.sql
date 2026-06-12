-- Shim TEST-ONLY do contrato Supabase para PGlite (NÃO é migração de produção).
-- Recria o mínimo que o Supabase fornece e que as migrações assumem:
-- schema auth, auth.users mínima, auth.uid()/auth.jwt()/auth.role()/auth.email(),
-- e os roles anon / authenticated / service_role(bypassrls) / supabase_auth_admin.

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin noinherit; end if;
end
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- Modelo de grants do Supabase: anon/authenticated/service_role já têm privilégio nas tabelas de public;
-- a RLS é o gate (não a falta de grant). Usamos DEFAULT PRIVILEGES p/ que as tabelas das migrações
-- nasçam com grant, MAS preservando revokes por coluna feitos pelas próprias migrações (ex.: verificado_em).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- identidade mínima (FK de pessoa aponta para cá, como na 0001)
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);

-- contrato de claims: lê current_setting('request.jwt.claims') (o que o harness injeta)
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
create or replace function auth.email() returns text language sql stable as $$
  select auth.jwt() ->> 'email'
$$;

grant execute on function auth.jwt() to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant execute on function auth.email() to anon, authenticated, service_role;
