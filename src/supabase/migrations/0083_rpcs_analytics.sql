-- Migração 0083 — RPCs analytics (portas da Onda 2)
-- spec 008: CA6/CA7/CA8/CA9/CA17/CA20/CA21 · RN13/RN14 · RS-B2/B3/B4/B5
-- Depende de: 0078 (analytics schema), 0079 (vw_velocidade_a),
--             0080 (mv_overview), 0081 (mv_rankings_publico), 0082 (mv_rankings_empresa),
--             0004 (is_admin, has_role — app_role enum), 0003 (coordenador_curso),
--             0053 (aprovado=true gate), 0001 (curso_ubm enum), 0002 (app_role enum).
--
-- INVARIANTES (duras — aplicadas na origem, não no app/front):
--   CA8/CA9: gate is_admin OR has_role('coordenador') ANTES de qualquer SELECT.
--   CA17: get_rankings_publicos paramétrica-zero (pronargs=0); LIMIT 50 FIXO na função.
--   CA20: search_path='' em toda função (identificadores schema-qualificados).
--   CA21: duas funções distintas — autenticada (get_overview) ≠ pública (get_rankings_publicos).
--   CA6/CA7: coordenador → só seus cursos (ponte coordenador_curso → curso.slug → mv_overview.curso).
--
-- PONTE curso_id↔enum (perigo #1):
--   coordenador_curso.curso_id (UUID) → public.curso.slug (curso_ubm) → mv_overview.curso (curso_ubm)
--   Gate: coordenador_curso.aprovado = true (migr 0053, default false).
--
-- DOWN (rollback):
--   drop function if exists public.get_rankings_publicos();
--   drop function if exists public.get_overview();

-- ── 1. get_overview() — autenticada (admin OU coordenador) ───────────────────
-- Retorna analytics.mv_overview filtrada por papel:
--   admin    → tudo (CA7)
--   coordenador → só cursos de coordenador_curso onde aprovado=true (CA6)
--   outros  → RAISE 42501 ANTES de qualquer SELECT (CA8/CA9)
create or replace function public.get_overview()
returns table (
  curso              public.curso_ubm,
  total_projetos     bigint,
  finalizados        bigint,
  alunos_distintos   bigint,
  taxa_finalizacao   numeric,
  atualizado_em      timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- ── Gate de papel (CA8/CA9): ANTES de qualquer leitura ─────────────────
  if not (
    (select public.is_admin())
    or (select public.has_role('coordenador'::public.app_role))
  ) then
    raise exception 'forbidden: apenas admin ou coordenador podem acessar get_overview'
      using errcode = '42501';
  end if;

  -- ── Admin: retorna todas as linhas da MV (CA7) ──────────────────────────
  if (select public.is_admin()) then
    return query
      select
        mv.curso,
        mv.total_projetos,
        mv.finalizados,
        mv.alunos_distintos,
        mv.taxa_finalizacao,
        mv.atualizado_em
      from analytics.mv_overview mv
      order by mv.curso;
    return;
  end if;

  -- ── Coordenador: só os cursos de coordenador_curso (aprovado=true) (CA6) ─
  -- Ponte: coordenador_curso.curso_id → public.curso.slug → mv_overview.curso
  return query
    select
      mv.curso,
      mv.total_projetos,
      mv.finalizados,
      mv.alunos_distintos,
      mv.taxa_finalizacao,
      mv.atualizado_em
    from analytics.mv_overview mv
    where mv.curso in (
      select c.slug
        from public.coordenador_curso cc
        join public.curso c on c.id = cc.curso_id
       where cc.user_id  = (select auth.uid())
         and cc.aprovado = true        -- gate migr 0053
         and c.deleted_at is null
    )
    order by mv.curso;
end; $$;

-- ── 2. get_rankings_publicos() — porta pública PARAMÉTRICA-ZERO (CA17/CA21) ──
-- Retorna dados das 2 MVs públicas; sem parâmetro de filtro (veto #9).
-- LIMIT 50 FIXO — nunca paginação ou parâmetro de offset exposto.
-- Objeto SEPARADO de get_overview (CA21 / veto #15).
-- Só colunas seguras: sem user_id/pessoa_id/email (RS-P4/CA18).
--
-- 3 seções (Família 4 — alunos + coordenadores + empresas):
--   tipo='aluno'       → papel_projeto='aluno'
--   tipo='coordenador' → papel_projeto IN ('host','co_coordenador')  [fix C5 / blocker BL-001]
--   tipo='empresa'     → mv_rankings_empresa (zero PII)
create or replace function public.get_rankings_publicos()
returns table (
  tipo           text,      -- 'aluno' | 'coordenador' | 'empresa' (discriminador de seção)
  nome           text,      -- nome_publico (aluno/coord) ou nome_canonico (empresa)
  rotulo_papel   text,      -- papel_projeto ou null (empresa)
  rotulo_curso   text,      -- curso ou null (empresa)
  projetos_finalizados bigint,
  contagem       bigint,    -- n_grupo (aluno/coord) ou alunos_distintos (empresa) — nunca PII
  atualizado_em  timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Pódio de alunos + coordenadores (mv_rankings_publico — opt-in + HAVING count(*)>=5)
  -- Pódio de empresas (mv_rankings_empresa — zero PII)
  -- LIMIT 50 FIXO por seção (CA17 / veto #9).
  return query
    (
      select
        -- C5 fix: host/co_coordenador → 'coordenador'; aluno → 'aluno'
        case
          when rp.rotulo_papel in ('host', 'co_coordenador') then 'coordenador'
          else 'aluno'
        end::text                      as tipo,
        rp.nome_publico                as nome,
        rp.rotulo_papel,
        rp.rotulo_curso,
        rp.projetos_finalizados,
        rp.contagem,
        rp.atualizado_em
      from analytics.mv_rankings_publico rp
      order by rp.projetos_finalizados desc, rp.nome_publico
      limit 50
    )
    union all
    (
      select
        'empresa'::text                as tipo,
        re.nome_canonico               as nome,
        null::text                     as rotulo_papel,
        null::text                     as rotulo_curso,
        re.projetos_finalizados,
        re.alunos_distintos            as contagem,
        re.atualizado_em
      from analytics.mv_rankings_empresa re
      order by re.projetos_finalizados desc, re.nome_canonico
      limit 50
    );
end; $$;
