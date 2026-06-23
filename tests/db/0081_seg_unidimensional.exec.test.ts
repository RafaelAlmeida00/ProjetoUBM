// @vitest-environment node
/**
 * T10 — BARREIRA DURA CA18a: agregado público UNIDIMENSIONAL
 *
 * VT-18: o GROUP BY de cada MV pública = 1 entidade (aluno OU empresa);
 *        sem cruzamento de ≥2 quase-identificadores simultaneamente.
 *        Varredura via pg_get_viewdef.
 *
 * spec: CA18a (DURO) · RN11b · RS-P3 · I4 · veto-seg #6
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco } from './_pglite/harness'
import { seedAnalytics } from './_pglite/seed-analytics'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
})
afterEach(async () => { await db.close() })

// Quase-identificadores que NÃO devem cruzar no mesmo agrupamento público
// (cruzar ≥2 re-identifica mesmo com N=5 + opt-in — CL-2 / RS-P3)
const QUASI_IDENTIFICADORES = [
  'empresa_id',
  'nome_canonico',    // empresa pelo nome
]

// Entidades únicas admitidas (cada MV pode ter UM destes, não combinações)
const ENTIDADE_PESSOAL = ['pessoa_id', 'nome_publico']
const ENTIDADE_EMPRESA = ['empresa_id', 'nome_canonico']

describe('0081 barreira CA18a — MVs públicas unidimensionais (T10/VT-18)', () => {

  // ── mv_rankings_publico: por pessoa, não cruza empresa ───────────────────
  it('VT-18: mv_rankings_publico é unidimensional por PESSOA (não cruza empresa)', async () => {
    const r = await db.query<{ def: string }>(
      `select pg_get_viewdef('analytics.mv_rankings_publico'::regclass) as def`
    )
    const def = r.rows[0]!.def.toLowerCase()

    // A MV de pessoa não deve referenciar colunas de empresa como quase-identificadores
    // em seu agrupamento (empresa_id ou nome_canonico como dimensão de agrupamento cruzado)
    // Nota: a MV pode JOINar empresa para contexto, mas não GROUP BY empresa + pessoa
    // Verificamos que não há GROUP BY combinando pessoa_id com empresa_id
    expect(def).not.toMatch(/group by[^;]*empresa_id/)

    // A dimensão de agrupamento deve ser pessoal (pessoa_id + papel + curso)
    // Verificado via CTE 'base': GROUP BY me.pessoa_id, me.papel_projeto, dc.curso
    expect(def).toMatch(/group by[^)]*pessoa_id/)
  })

  it('VT-18: mv_rankings_publico não cruza ≥2 quase-identificadores na dimensão pública', async () => {
    const r = await db.query<{ def: string }>(
      `select pg_get_viewdef('analytics.mv_rankings_publico'::regclass) as def`
    )
    const def = r.rows[0]!.def.toLowerCase()

    // O resultado final deve ter agrupamento baseado em UMA entidade (pessoa)
    // A CTE 'grupos' deve agrupar por (papel, curso) — dimensão unidimensional de papel+curso
    // NÃO deve cruzar (papel, curso) com (empresa) simultaneamente como quase-identificador

    // A CTE 'grupos' conta pessoas por (papel, curso) — sem empresa no GROUP BY
    // Verificamos que a CTE não combina empresa como dimensão adicional
    expect(def).not.toMatch(/grupos\s+as\s+\([^)]*empresa/s)
  })

  // ── mv_rankings_empresa: por empresa, não projeta pessoa ─────────────────
  it('VT-18: mv_rankings_empresa é unidimensional por EMPRESA (não projeta pessoa)', async () => {
    const r = await db.query<{ def: string }>(
      `select pg_get_viewdef('analytics.mv_rankings_empresa'::regclass) as def`
    )
    const def = r.rows[0]!.def.toLowerCase()

    // Agrupamento por empresa_id (dimensão única)
    expect(def).toMatch(/group by[^;]*empresa/)

    // Não deve cruzar empresa + pessoa no mesmo agrupamento
    expect(def).not.toMatch(/group by[^;]*pessoa_id/)
    expect(def).not.toMatch(/group by[^;]*nome_publico/)
  })

  // ── Estrutural: pg_get_viewdef funciona para ambas as MVs ────────────────
  it('ambas as MVs públicas existem e pg_get_viewdef retorna definição', async () => {
    for (const mv of ['mv_rankings_publico', 'mv_rankings_empresa']) {
      const r = await db.query<{ def: string }>(
        `select pg_get_viewdef('analytics.${mv}'::regclass) as def`
      )
      expect(r.rows).toHaveLength(1)
      expect(r.rows[0]!.def.length).toBeGreaterThan(10)
    }
  })
})
