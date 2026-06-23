-- Migração 0080 — MV analytics.mv_overview (Família 3 / Velocidade B)
-- spec 008: CA24/CA25 · RN3/RN6/RN7 · RS-B6/P7 · AD-008-1
-- Depende de: 0078 (schema analytics), 0015 (dor, status_dor), 0016 (dor_curso, enum curso_ubm),
--             0030 (projeto, status_projeto), 0033 (membro_equipe, pessoa_id).
--
-- Agregação por CURSO (enum curso_ubm) via dor_curso → dor → projeto → membro_equipe.
-- Soft-delete respeitado (deleted_at is null em dor e projeto — CA24/RN7).
-- Só status='finalizado' conta como finalizado (CA25/RN7).
-- Coluna atualizado_em = now() capturada no momento do REFRESH (AD-008-1 / CA11).
--
-- DOWN (rollback):
--   drop index if exists analytics.mv_overview_curso_uniq;
--   drop materialized view if exists analytics.mv_overview;

create materialized view analytics.mv_overview as
select
  dc.curso,

  -- Total de projetos ativos derivados de dores deste curso (não soft-deletados)
  count(distinct p.id)::bigint as total_projetos,

  -- Finalizados reais (status='finalizado' E não soft-deletados — CA24/CA25)
  count(distinct p.id) filter (where p.status = 'finalizado')::bigint as finalizados,

  -- Alunos envolvidos (distinct por pessoa_id, membros ativos — CA24/RN7)
  count(distinct me.pessoa_id)::bigint as alunos_distintos,

  -- Taxa de finalização (0 quando total=0 para evitar divisão por zero)
  case
    when count(distinct p.id) = 0 then 0.0
    else round(
      count(distinct p.id) filter (where p.status = 'finalizado')::numeric
      / count(distinct p.id)::numeric * 100,
      2
    )
  end as taxa_finalizacao,

  -- Carimbo de frescor: momento do REFRESH (AD-008-1 / CA11)
  now() as atualizado_em

from public.dor_curso dc
join public.dor d     on d.id       = dc.dor_id
                     and d.deleted_at is null        -- soft-delete (CA24/RN7)
join public.projeto p on p.dor_id   = d.id
                     and p.deleted_at is null        -- soft-delete (CA24/RN7)
left join public.membro_equipe me
                     on me.projeto_id = p.id
                     and me.deleted_at is null       -- membros ativos
group by dc.curso
with no data
;

-- Índice UNIQUE obrigatório para REFRESH CONCURRENTLY (RS-B6)
create unique index mv_overview_curso_uniq
  on analytics.mv_overview (curso);
