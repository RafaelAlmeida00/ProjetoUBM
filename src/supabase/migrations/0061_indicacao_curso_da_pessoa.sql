-- 0061 — indicacoes_coordenador.curso = curso da PESSOA indicada (não os cursos da dor)
--
-- Bug (UI /app/dores "Indicações recebidas", admin/coord): um ALUNO indicado aparecia com os
-- cursos que o REPRESENTANTE escolheu na dor (fallback dor_curso da 0060), em vez do próprio
-- curso. O coordenador aparecia certo (branch coordenador_curso). Causa: a 0060 só resolvia
-- coordenador_curso e caía em dor_curso para o resto.
--
-- Correção: resolver o curso pela PESSOA + PAPEL da indicação —
--   papel_pretendido='coordenador' → coordenador_curso (aprovado);
--   caso contrário (aluno)         → aluno_curso (matrícula, 0047).
-- Sempre por nome próprio (curso.nome). Sem fallback para dor_curso (dado errado: é da dor,
-- não da pessoa). Aluno sem aluno_curso → curso '' (não vaza os cursos da dor).
--
-- Apenas a expressão `curso` muda; gate (coord-do-curso/host/admin), identidade e shape iguais à 0060.
-- Grants: CREATE OR REPLACE reseta privilégios default (hospedado concede anon) → re-hardening abaixo.
-- Rollback: recriar indicacoes_coordenador da 0060 (com a expressão coordenador_curso/dor_curso).

create or replace function public.indicacoes_coordenador(p_projeto_id uuid)
returns table(id uuid, projeto_id uuid, pessoa_id uuid, papel_pretendido text, mensagem text, created_at timestamptz, deleted_at timestamptz, aluno_nome text, aluno_email text, curso text)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not (
    (select public.is_dor_course_coordinator(p_projeto_id))
    or (select public.is_project_host(p_projeto_id))
    or (select public.is_admin())
  ) then
    return;
  end if;
  return query
    select i.id, i.projeto_id, i.pessoa_id, i.papel_pretendido::text, i.mensagem,
      i.created_at, i.deleted_at,
      coalesce(p.nome_publico, '') as aluno_nome,
      coalesce(u.email::text, '')  as aluno_email,
      coalesce(
        case
          when i.papel_pretendido = 'coordenador' then
            (select string_agg(c.nome, ', ' order by c.nome)
               from public.coordenador_curso cc
               join public.curso c on c.id = cc.curso_id
              where cc.user_id = i.pessoa_id and cc.aprovado = true)
          else
            (select string_agg(c.nome, ', ' order by c.nome)
               from public.aluno_curso ac
               join public.curso c on c.id = ac.curso_id
              where ac.user_id = i.pessoa_id)
        end,
        '') as curso
    from public.indicacao i
    join auth.users u on u.id = i.pessoa_id
    left join public.perfil p on p.user_id = i.pessoa_id
    where i.projeto_id = p_projeto_id
    order by i.created_at asc;
end; $function$;

-- Re-hardening de grants (CREATE OR REPLACE reseta para PUBLIC no hospedado).
revoke all on function public.indicacoes_coordenador(uuid) from public;
revoke execute on function public.indicacoes_coordenador(uuid) from anon;
grant execute on function public.indicacoes_coordenador(uuid) to authenticated;
