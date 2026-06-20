-- 0058 — Nome real nas visualizações INTERNAS (equipe + timeline)
-- Por quê: o requisito de produto é "toda referência a usuário pelo NOME" nas telas internas
-- (admin/host/coordenador-do-curso/membro), mantendo a vitrine pública (anon) anonimizada por
-- ranking_optin (RS9/LGPD — spec 005). Hoje equipe_publica/timeline_publica anonimizam SEMPRE que
-- ranking_optin=false, então a equipe aparece como tag anônima mesmo para quem gerencia o projeto.
--
-- Também corrige o CONTRATO com o FE: equipe_publica retornava (papel_projeto, nome, curso), mas o
-- componente UbmMember consome (nome_ou_papel, nome_revelado, ranking_optin) — desalinhamento que
-- deixava o nome sempre undefined. Agora a RPC entrega exatamente o que o FE espera.
--
-- Audiência interna = is_admin() OR is_team_member(projeto) OR is_dor_course_coordinator(projeto).
-- (is_project_host ⊂ is_team_member.) Para anon, v_interno é sempre falso → vitrine segue gated.
--
-- Rollback: recriar as funções com os corpos da 0036 (anonimização incondicional por ranking_optin).

-- equipe_publica muda a ASSINATURA (nova coluna nome_revelado + ranking_optin) → DROP + CREATE.
drop function if exists public.equipe_publica(uuid);

create function public.equipe_publica(p_projeto_id uuid)
returns table(
  papel_projeto text,
  nome_ou_papel text,
  nome_revelado boolean,
  ranking_optin boolean,
  curso text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_interno boolean := (select public.is_admin())
                    or (select public.is_team_member(p_projeto_id))
                    or (select public.is_dor_course_coordinator(p_projeto_id));
begin
  return query
  select
    me.papel_projeto::text,
    -- nome real só quando (interno OU opt-in público) e há nome_publico; senão "Papel · curso".
    case
      when (v_interno or coalesce(p.ranking_optin, false))
           and coalesce(btrim(p.nome_publico), '') <> ''
        then p.nome_publico
      else
        (case me.papel_projeto::text
           when 'host' then 'Host'
           when 'co_coordenador' then 'Co-coordenador'
           else 'Aluno'
         end)
        || coalesce(' · ' || nullif(cur.cursos, ''), '')
    end as nome_ou_papel,
    ((v_interno or coalesce(p.ranking_optin, false))
       and coalesce(btrim(p.nome_publico), '') <> '') as nome_revelado,
    coalesce(p.ranking_optin, false) as ranking_optin,
    cur.cursos as curso
  from public.membro_equipe me
  join public.perfil p on p.user_id = me.pessoa_id
  left join lateral (
    select string_agg(c.nome, ', ' order by c.nome) as cursos
    from public.coordenador_curso cc
    join public.curso c on c.id = cc.curso_id
    where cc.user_id = me.pessoa_id and cc.aprovado = true
  ) cur on true
  where me.projeto_id = p_projeto_id and me.deleted_at is null
  order by me.papel_projeto;
end;
$function$;

-- timeline_publica mantém a ASSINATURA (autor_nome) → CREATE OR REPLACE.
create or replace function public.timeline_publica(p_projeto_id uuid)
returns table(
  de_status text,
  para_status text,
  ocorrido_em timestamptz,
  motivo text,
  autor_nome text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_interno boolean := (select public.is_admin())
                    or (select public.is_team_member(p_projeto_id))
                    or (select public.is_dor_course_coordinator(p_projeto_id));
begin
  return query
  select
    se.de_status::text,
    se.para_status::text,
    se.ocorrido_em,
    se.motivo,
    case
      when (v_interno or coalesce(ap.ranking_optin, false))
           and coalesce(btrim(ap.nome_publico), '') <> ''
        then ap.nome_publico
      else null
    end as autor_nome
  from public.status_evento se
  left join public.perfil ap on ap.user_id = se.autor_id
  where se.projeto_id = p_projeto_id
  order by se.ocorrido_em;
end;
$function$;

-- Re-hardening de grants (DROP/CREATE OR REPLACE resetam EXECUTE — ver memória do projeto).
-- Estas RPCs são públicas (vitrine /casos por anon) → anon + authenticated, nunca PUBLIC.
revoke all on function public.equipe_publica(uuid) from public;
revoke all on function public.timeline_publica(uuid) from public;
grant execute on function public.equipe_publica(uuid) to anon, authenticated;
grant execute on function public.timeline_publica(uuid) to anon, authenticated;
