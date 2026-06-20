-- Migração 0056 — listar_usuarios_admin enriquecida: nome + cursos_coordenados
-- Gap de contrato: UI UsuarioAdmin espera nome e cursos_coordenados[]; a versão
-- anterior (0043) retornava apenas (id, email, papeis, is_admin).
-- Depende de: 0003 (perfil.nome_publico, coordenador_curso, curso),
--             0043 (listar_usuarios_admin — DROP implícito pelo CREATE OR REPLACE),
--             0053 (coordenador_curso.aprovado).
-- Shape final:
--   id uuid, email text, nome text, papeis text[], is_admin boolean,
--   cursos_coordenados jsonb  (array de {curso_id, curso_label}; [] quando vazio)

-- ══════════════════════════════════════════════════════════════════════════════
-- §1 — Recriar listar_usuarios_admin com nome + cursos_coordenados
-- ══════════════════════════════════════════════════════════════════════════════
-- Mantém: set search_path = '' (hardening contra search_path injection);
--         gate is_admin() interno (apenas admin vê dados — LGPD: e-mail só a admin).
-- Novo:   LEFT JOIN perfil → coalesce(nome_publico, '') como `nome`.
--         Subquery lateral → jsonb_agg de {curso_id, curso_label} onde aprovado=true;
--         coalesce para '[]'::jsonb quando não houver vínculo aprovado.
-- DROP obrigatório: CREATE OR REPLACE não permite mudar o tipo de retorno (adicionar colunas).
drop function if exists public.listar_usuarios_admin();
create or replace function public.listar_usuarios_admin()
returns table(
  id                 uuid,
  email              text,
  nome               text,
  papeis             text[],
  is_admin           boolean,
  cursos_coordenados jsonb
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
      coalesce(p.nome_publico, '')                                     as nome,
      coalesce(
        array_agg(pu.role::text) filter (where pu.role is not null),
        '{}'
      )                                                                as papeis,
      exists (
        select 1 from public.admin_app aa where aa.user_id = u.id
      )                                                                as is_admin,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('curso_id', cc.curso_id, 'curso_label', c.nome)
            order by c.nome
          )
          from public.coordenador_curso cc
          join public.curso c on c.id = cc.curso_id
          where cc.user_id  = u.id
            and cc.aprovado = true
        ),
        '[]'::jsonb
      )                                                                as cursos_coordenados
    from auth.users u
    left join public.perfil       p  on p.user_id  = u.id
    left join public.papel_usuario pu on pu.user_id = u.id
    group by u.id, u.email, p.nome_publico
    order by u.email;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §H — HARDENING: revoke public + revoke anon explícito + grant authenticated
-- ══════════════════════════════════════════════════════════════════════════════
-- Gotcha hospedado (Memória: grant-reset-create-or-replace + supabase-anon-default-privileges):
-- CREATE OR REPLACE reseta EXECUTE para PUBLIC.
-- ALTER DEFAULT PRIVILEGES do Supabase concede anon em funções novas automaticamente.
-- Necessário: revoke from public E revoke from anon EXPLÍCITO + grant to authenticated.

revoke execute on function public.listar_usuarios_admin() from public;
revoke execute on function public.listar_usuarios_admin() from anon;
grant  execute on function public.listar_usuarios_admin() to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — restaura assinatura da 0043)                           ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop function if exists public.listar_usuarios_admin();
-- create or replace function public.listar_usuarios_admin()
-- returns table(id uuid, email text, papeis text[], is_admin boolean)
-- language plpgsql security definer set search_path = ''
-- as $$
-- begin
--   if not (select public.is_admin()) then
--     raise exception 'apenas admin pode listar usuarios';
--   end if;
--   return query
--     select u.id, u.email::text,
--            coalesce(array_agg(pu.role::text) filter (where pu.role is not null), '{}'),
--            exists (select 1 from public.admin_app aa where aa.user_id = u.id)
--     from auth.users u
--     left join public.papel_usuario pu on pu.user_id = u.id
--     group by u.id, u.email
--     order by u.email;
-- end; $$;
-- revoke execute on function public.listar_usuarios_admin() from public;
-- revoke execute on function public.listar_usuarios_admin() from anon;
-- grant execute on function public.listar_usuarios_admin() to authenticated;
-- ╚══════════════════════════════════════════════════════════════════════════╝
