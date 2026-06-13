-- Migração 0054 — RPC listar_coordenadores_pendentes (admin-only)
-- Shape espelha CoordenadorPendente em lib/actions/admin-usuarios.ts:39-47.
-- Depende de: 0053 (coordenador_curso.aprovado), 0003 (coordenador_curso/curso), 0004 (is_admin).

-- ── RPC listar_coordenadores_pendentes ───────────────────────────────────────
-- Retorna vínculos com aprovado=false para a tela de aprovação do admin.
-- Padrão peça lacrada: não-admin recebe vazio (sem raise — não vaza se há pendentes).
-- id: user_id::text usado como identificador de linha (PK composta user_id+curso_id;
--   a UI de aprovação usa user_id isoladamente — ver aprovarCoordenador/recusarCoordenador).
create or replace function public.listar_coordenadores_pendentes()
returns table(
  id          text,        -- user_id::text (identificador para a UI)
  user_id     uuid,
  nome        text,        -- perfil.nome_publico (coalesce → '')
  email       text,        -- auth.users.email (coalesce → '')
  curso_id    uuid,
  curso_label text,        -- curso.nome
  aprovado    boolean      -- sempre false nesta RPC (filtro WHERE)
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Gate: retorno vazio para não-admin (padrão peça lacrada — não vaza existência)
  if not (select public.is_admin()) then
    return;
  end if;

  return query
    select
      cc.user_id::text                        as id,
      cc.user_id,
      coalesce(p.nome_publico, '')            as nome,
      coalesce(u.email::text, '')             as email,
      cc.curso_id,
      coalesce(c.nome, '')                    as curso_label,
      cc.aprovado
    from public.coordenador_curso cc
    join public.curso     c on c.id       = cc.curso_id
    join auth.users       u on u.id       = cc.user_id
    left join public.perfil p on p.user_id = cc.user_id
    where cc.aprovado = false
    order by cc.created_at asc;
end;
$$;

-- ── HARDENING: revoke public + revoke anon explícito (gotcha Supabase hosted) ─
-- ALTER DEFAULT PRIVILEGES no hospedado concede anon em funções novas automaticamente.
-- revoke from public não basta — precisa revoke from anon explícito (Memória: supabase-anon-default-privileges).
revoke execute on function public.listar_coordenadores_pendentes() from public;
revoke execute on function public.listar_coordenadores_pendentes() from anon;
grant  execute on function public.listar_coordenadores_pendentes() to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback)                                                          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop function if exists public.listar_coordenadores_pendentes();
-- ╚══════════════════════════════════════════════════════════════════════════╝
