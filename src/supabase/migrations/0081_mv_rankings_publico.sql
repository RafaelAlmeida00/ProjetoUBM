-- Migração 0081 — MV analytics.mv_rankings_publico (Família 4 / alunos+coordenadores)
-- spec 008: CA14/CA15/CA16/CA18/CA18a/CA26 · RN8-RN12/RN11b/RN15 · RS-P1/P2/P3/P4 · AD-008-1
-- Depende de: 0078 (schema analytics), 0003 (perfil.ranking_optin), 0030 (projeto),
--             0033 (membro_equipe, papel_projeto), 0015 (dor), 0016 (dor_curso).
--
-- INVARIANTES DE PRIVACIDADE (duras — fecham vetos na origem do dado):
--   RS-P1: só entram linhas com perfil.ranking_optin = true (opt-in; default false — CA14)
--   RS-P2: HAVING count(*) >= 5 DENTRO da MV — N=5 constante/auditável (CA16/T11)
--   RS-P3: unidimensional por pessoa — agrupamento ÚNICO por (pessoa, papel, curso) (CA18a)
--   RS-P4: zero PII — sem user_id/pessoa_id/email/telefone projetado (CA18)
--   RS-P6: refresh lê ranking_optin atual → opt-out remove nome no próximo refresh (CA26)
--   CA24/CA25: deleted_at is null + status='finalizado' (T12)
--
-- DOWN (rollback):
--   drop index if exists analytics.mv_rankings_publico_uniq;
--   drop materialized view if exists analytics.mv_rankings_publico;

create materialized view analytics.mv_rankings_publico as
with
-- Base: por pessoa × papel × curso, conta projetos finalizados (opt-in + soft-delete + finalizado)
base as (
  select
    me.pessoa_id,
    me.papel_projeto::text                          as rotulo_papel,
    dc.curso::text                                  as rotulo_curso,
    count(distinct p.id)::bigint                    as projetos_finalizados
  from public.membro_equipe      me
  join public.projeto            p  on p.id        = me.projeto_id
                                   and p.status    = 'finalizado'  -- CA25/RN7
                                   and p.deleted_at is null         -- CA24/RN7
  join public.dor                d  on d.id        = p.dor_id
                                   and d.deleted_at is null         -- CA24/RN7
  join public.dor_curso          dc on dc.dor_id   = d.id
  join public.perfil             pf on pf.user_id  = me.pessoa_id
                                   and pf.ranking_optin = true      -- RS-P1/CA14
  where me.deleted_at is null                                       -- membros ativos
  group by me.pessoa_id, me.papel_projeto, dc.curso
),
-- Contagem do grupo por (papel, curso) para k-anonimato
grupos as (
  select
    rotulo_papel,
    rotulo_curso,
    count(*) as n_grupo
  from base
  group by rotulo_papel, rotulo_curso
  having count(*) >= 5  -- RS-P2/CA16: N=5 FIXO dentro da MV (não no app/RPC/front)
)
-- Projeta apenas colunas seguras (RS-P4/CA18): nome_publico + rótulos + métricas
-- Zero PII: sem user_id/pessoa_id/autor_id/email/telefone/documento/IP
select
  pf.nome_publico,                          -- nominal só sob opt-in + k-anon ≥5
  b.rotulo_papel,
  b.rotulo_curso,
  b.projetos_finalizados,
  g.n_grupo                as contagem,     -- tamanho do grupo (não identifica indivíduo)
  now()                    as atualizado_em -- AD-008-1: carimbo do REFRESH
from base          b
join grupos        g  on g.rotulo_papel = b.rotulo_papel
                     and g.rotulo_curso  = b.rotulo_curso
join public.perfil pf on pf.user_id     = b.pessoa_id
with no data
;

-- Índice UNIQUE na chave natural (nome × papel × curso) — obrigatório p/ REFRESH CONCURRENTLY (RS-B6)
-- nome_publico pode ser null se ainda não preenchido; usamos coalesce para garantir unicidade
create unique index mv_rankings_publico_uniq
  on analytics.mv_rankings_publico (coalesce(nome_publico, ''), rotulo_papel, rotulo_curso);
