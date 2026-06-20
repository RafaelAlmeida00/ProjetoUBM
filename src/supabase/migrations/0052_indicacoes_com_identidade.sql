-- Migração 0052 — RPC indicacoes_coordenador: identidade do candidato para coord/admin (Bug #6)
-- architecture.md §3.3; security.md RS2, RS9, CA25.
-- Gate interno: is_dor_course_coordinator(p_projeto_id) OR is_admin().
-- Sem gate → retorna vazio silenciosamente (aluno/representante/anon seguem peça lacrada).
-- Depende de: 0032 (indicacao), 0036 (is_dor_course_coordinator), 0003 (perfil), 0043 (is_admin).

-- ── RPC indicacoes_coordenador: retorna identidade com gate de papel ──────────
create or replace function public.indicacoes_coordenador(p_projeto_id uuid)
returns table(
  id               uuid,
  projeto_id       uuid,
  pessoa_id        uuid,
  papel_pretendido text,
  mensagem         text,
  created_at       timestamptz,
  deleted_at       timestamptz,
  aluno_nome       text,
  aluno_email      text,
  curso            text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Gate: apenas coordenador-do-curso-da-dor OU admin vê identidade (RS2/CA25)
  if not (
    (select public.is_dor_course_coordinator(p_projeto_id))
    or (select public.is_admin())
  ) then
    -- Retorna vazio — sem raise, para não vazar se o projeto existe ou não
    return;
  end if;

  return query
    select
      i.id,
      i.projeto_id,
      i.pessoa_id,
      i.papel_pretendido::text,
      i.mensagem,
      i.created_at,
      i.deleted_at,
      coalesce(p.nome_publico, '')          as aluno_nome,
      coalesce(u.email::text, '')           as aluno_email,
      coalesce(
        (select string_agg(c.nome, ', ' order by c.nome)
           from public.coordenador_curso cc
           join public.curso c on c.id = cc.curso_id
          where cc.user_id = i.pessoa_id),
        (select string_agg(dc.curso::text, ', ' order by dc.curso::text)
           from public.dor_curso dc
           join public.projeto pr on pr.dor_id = dc.dor_id
          where pr.id = p_projeto_id
          limit 1),
        ''
      )                                     as curso
    from public.indicacao i
    join auth.users u  on u.id  = i.pessoa_id
    left join public.perfil p on p.user_id = i.pessoa_id
    where i.projeto_id = p_projeto_id
    order by i.created_at asc;
end;
$$;

-- Grants: apenas authenticated (gate interno bloqueia aluno/anon via retorno vazio)
revoke execute on function public.indicacoes_coordenador(uuid) from public;
revoke execute on function public.indicacoes_coordenador(uuid) from anon;
grant  execute on function public.indicacoes_coordenador(uuid) to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ DOWN (rollback)                                                            ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop function if exists public.indicacoes_coordenador(uuid);
-- ╚══════════════════════════════════════════════════════════════════════════╝
