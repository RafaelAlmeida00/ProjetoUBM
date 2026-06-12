-- Migração 0004 — Custom Access Token Hook + helpers SECURITY DEFINER (architecture.md §4/§5; ADR-0002)
-- search_path='' (trava de segurança); helpers chamados como (select helper()) nas policies (initplan).

-- Hook: injeta claims leves {is_admin, roles, verificado}. Só supabase_auth_admin executa.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  claims  jsonb := event -> 'claims';
  uid     uuid  := (event ->> 'user_id')::uuid;
  v_admin boolean; v_roles jsonb; v_verif boolean;
begin
  select exists (select 1 from public.admin_app a where a.user_id = uid) into v_admin;
  select coalesce(jsonb_agg(pu.role), '[]'::jsonb) from public.papel_usuario pu where pu.user_id = uid into v_roles;
  select (p.verificado_em is not null) from public.perfil p where p.user_id = uid into v_verif;
  claims := jsonb_set(claims, '{is_admin}',   to_jsonb(coalesce(v_admin, false)));
  claims := jsonb_set(claims, '{roles}',      coalesce(v_roles, '[]'::jsonb));
  claims := jsonb_set(claims, '{verificado}', to_jsonb(coalesce(v_verif, false)));
  return jsonb_set(event, '{claims}', claims);
end; $$;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- Helpers de autorização (SECURITY DEFINER evita RLS recursiva nas junções)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)
      or exists (select 1 from public.admin_app a where a.user_id = (select auth.uid()));
$$;

create or replace function public.has_role(p_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.papel_usuario pu
                 where pu.user_id = (select auth.uid()) and pu.role = p_role);
$$;

create or replace function public.is_course_coordinator(p_curso_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coordenador_curso cc
                 where cc.user_id = (select auth.uid()) and cc.curso_id = p_curso_id);
$$;

create or replace function public.is_company_rep(p_empresa_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membro_empresa me
                 where me.user_id = (select auth.uid()) and me.empresa_id = p_empresa_id);
$$;

create or replace function public.esta_verificado()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfil p
                 where p.user_id = (select auth.uid()) and p.verificado_em is not null);
$$;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.has_role(public.app_role) to anon, authenticated;
grant execute on function public.is_course_coordinator(uuid) to anon, authenticated;
grant execute on function public.is_company_rep(uuid) to anon, authenticated;
grant execute on function public.esta_verificado() to anon, authenticated;

-- Cria o perfil automaticamente quando nasce um usuário (perfil sempre existe)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfil (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
