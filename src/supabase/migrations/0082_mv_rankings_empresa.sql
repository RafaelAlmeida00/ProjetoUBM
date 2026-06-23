-- Migração 0082 — MV analytics.mv_rankings_empresa (Família 4 / empresas)
-- spec 008: CA18b · RN12b · RS-P5 · I6 · veto-seg #8 · AD-008-2
-- Depende de: 0078 (schema analytics), 0001 (empresa), 0015 (dor), 0016 (dor_curso),
--             0030 (projeto).
--
-- INVARIANTES DE PRIVACIDADE (duras — fecham veto-seg #8 na origem do dado):
--   RS-P5: zero coluna de pessoa — sem user_id/pessoa_id/nome_publico/email projetado (CA18b)
--   CA18b: unidimensional por empresa — agrupamento por empresa_id ÚNICO (CA18a estendido)
--   RS-B6 (análogo): HAVING não aplicável aqui (métrica é por empresa, não k-anon pessoal);
--          MV agrega por empresa publicamente acessível (empresa.nome_canonico é pública)
--   CA24/CA25: deleted_at is null + status='finalizado' (T12)
--
-- DESIGN:
--   Dimensão: empresa (empresa_id + nome_canonico)
--   Métricas: total_projetos, projetos_finalizados, alunos_distintos (contagem anônima)
--   Zero join com perfil ou membro_empresa — somente:
--     dor → dor_curso → projeto (para contar projetos)
--     dor.empresa_id → empresa (para obter nome_canonico)
--   alunos_distintos conta membros via membro_equipe.pessoa_id
--   (membro_equipe.papel_projeto é papel no projeto, não PII — é dimensão técnica)
--
-- DOWN (rollback):
--   drop index if exists analytics.mv_rankings_empresa_empresa_id_uniq;
--   drop materialized view if exists analytics.mv_rankings_empresa;

create materialized view analytics.mv_rankings_empresa as
select
  d.empresa_id,
  e.nome_canonico,                                              -- identificador público da empresa (não-PII)
  count(distinct p.id)::bigint                                  as total_projetos,
  count(distinct p.id) filter (where p.status = 'finalizado')::bigint
                                                                as projetos_finalizados,
  count(distinct me.pessoa_id)::bigint                          as alunos_distintos, -- contagem anônima
  now()                                                         as atualizado_em     -- AD-008-1
from public.dor        d
join public.empresa    e  on e.id       = d.empresa_id
join public.projeto    p  on p.dor_id  = d.id
                         and p.deleted_at is null              -- CA24/RN7: soft-delete
left join public.membro_equipe me on me.projeto_id = p.id
                         and me.deleted_at is null
where d.deleted_at is null                                     -- CA24/RN7: soft-delete em dor
  and p.status = 'finalizado'                                  -- CA25/RN7: só projetos finalizados
group by d.empresa_id, e.nome_canonico
with no data
;

-- Índice UNIQUE em empresa_id — chave natural da dimensão empresa (obrigatório p/ REFRESH CONCURRENTLY)
create unique index mv_rankings_empresa_empresa_id_uniq
  on analytics.mv_rankings_empresa (empresa_id);
