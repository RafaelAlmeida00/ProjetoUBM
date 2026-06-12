-- Migração 0043 — RPCs admin: ler_audit v2 + listar_usuarios_admin + conceder_papel (Delta 2 — 2026-06-11)
-- architecture.md §Delta 2 · tasks.md §T-X1/T-X2/T-X3
-- Resolve F2 (auditoria mostra ANTES→DEPOIS {}) e F2b (admin onboarding falha)

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) ler_audit v2 — retorna colunas reais da audit.record_version (T-X1)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Estende o shape de retorno: adiciona id, old (old_record), new (record) que
-- já existem na tabela (0008:14-15) mas não eram projetados.
-- Mantém: is_admin() guard (admin-only LGPD), search_path='', DEFINER.
-- Drop prévio necessário porque o tipo de retorno mudou.
drop function if exists public.ler_audit(int);
create or replace function public.ler_audit(p_limit int default 100)
returns table(
  id bigint,
  op text,
  tabela text,
  ator uuid,
  datahora timestamptz,
  old jsonb,
  new jsonb,
  actor_role text,
  record_id uuid
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'apenas admin pode ler o log de auditoria';
  end if;

  return query
    select
      rv.id,
      rv.op,
      rv.tabela,
      rv.actor_id      as ator,
      rv.ts            as datahora,
      rv.old_record    as old,
      rv.record        as new,
      rv.actor_role,
      rv.record_id
    from audit.record_version rv
    order by rv.id desc
    limit p_limit;
end;
$$;

revoke execute on function public.ler_audit(int) from public;
revoke execute on function public.ler_audit(int) from anon;
grant  execute on function public.ler_audit(int) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) listar_usuarios_admin — junta auth.users × papel_usuario × admin_app (T-X2)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Apenas admin vê dados (gate is_admin() interno). LGPD: e-mail só a admin.
-- Usa plpgsql (não sql puro) para poder checar is_admin() antes de retornar.
create or replace function public.listar_usuarios_admin()
returns table(
  id uuid,
  email text,
  papeis text[],
  is_admin boolean
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'apenas admin pode listar usuarios';
  end if;

  return query
    select
      u.id,
      u.email::text,
      coalesce(array_agg(pu.role::text) filter (where pu.role is not null), '{}') as papeis,
      exists (select 1 from public.admin_app aa where aa.user_id = u.id) as is_admin
    from auth.users u
    left join public.papel_usuario pu on pu.user_id = u.id
    group by u.id, u.email
    order by u.email;
end;
$$;

revoke execute on function public.listar_usuarios_admin() from public;
revoke execute on function public.listar_usuarios_admin() from anon;
grant  execute on function public.listar_usuarios_admin() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3) conceder_papel — insere papel com coluna role (não papel) (T-X3)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Substitui o insert direto .from('papel_usuario').insert({papel}) que usava
-- coluna errada (papel em vez de role) e bypassava RLS silenciosamente.
create or replace function public.conceder_papel(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'apenas admin pode conceder papeis';
  end if;

  insert into public.papel_usuario (user_id, role)
  values (p_user_id, p_role::public.app_role)
  on conflict (user_id, role) do nothing;
end;
$$;

revoke execute on function public.conceder_papel(uuid, text) from public;
revoke execute on function public.conceder_papel(uuid, text) from anon;
grant  execute on function public.conceder_papel(uuid, text) to authenticated;
