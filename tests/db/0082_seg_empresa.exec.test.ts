// @vitest-environment node
/**
 * T08 — 0082_mv_rankings_empresa: MV analytics.mv_rankings_empresa
 *
 * RED: MV não existe → queries falham.
 * GREEN: MV criada → VT-19 + T12 (soft-delete/finalizado) verdes.
 *
 * spec: CA18b (DURO) · RN12b · RS-P5 · I6 · veto-seg #8 · AD-008-2
 *
 * VT-19: inspeção — só empresa+métrica+contagem; zero coluna de pessoa;
 *        ausência de join com perfil/membro_empresa via pg_get_viewdef.
 * T12: soft-delete/finalizado replicados (CA24/CA25).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco } from './_pglite/harness'
import { seedAnalytics, IDS } from './_pglite/seed-analytics'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
  await db.exec(`refresh materialized view analytics.mv_rankings_empresa`)
})
afterEach(async () => { await db.close() })

// Colunas de pessoa absolutamente proibidas (RS-P5/CA18b)
const COLUNAS_PESSOA_PROIBIDAS = [
  'user_id',
  'pessoa_id',
  'autor_id',
  'responsavel_id',
  'nome_publico',
  'email',
  'rep_nome',
  'host_coordenador_id',
  'created_by',
  'deleted_by',
]

describe('0082 mv_rankings_empresa — T08/T12 (VT-19 + soft-delete/finalizado)', () => {

  // ── VT-19: inspeção de colunas via pg_attribute ───────────────────────────
  it('VT-19: mv_rankings_empresa NÃO projeta colunas de pessoa', async () => {
    const r = await db.query<{ attname: string }>(
      `select a.attname
       from pg_catalog.pg_attribute a
       join pg_catalog.pg_class     c on c.oid = a.attrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'analytics'
         and c.relname = 'mv_rankings_empresa'
         and a.attnum  > 0
         and not a.attisdropped`
    )
    const colunas = r.rows.map(row => row.attname.toLowerCase())

    for (const proibida of COLUNAS_PESSOA_PROIBIDAS) {
      expect(
        colunas,
        `coluna de pessoa "${proibida}" encontrada em mv_rankings_empresa (veto #8 / CA18b)`
      ).not.toContain(proibida)
    }
  })

  it('VT-19: mv_rankings_empresa tem empresa_id + métricas', async () => {
    const r = await db.query<{ attname: string }>(
      `select a.attname
       from pg_catalog.pg_attribute a
       join pg_catalog.pg_class     c on c.oid = a.attrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'analytics'
         and c.relname = 'mv_rankings_empresa'
         and a.attnum  > 0
         and not a.attisdropped`
    )
    const colunas = r.rows.map(row => row.attname)
    expect(colunas).toContain('empresa_id')
    expect(colunas).toContain('atualizado_em') // AD-008-1
    const temMetrica = colunas.some(c => c.includes('projeto') || c.includes('total') || c.includes('finaliz'))
    expect(temMetrica, 'deve ter coluna de métrica de projetos').toBe(true)
  })

  // ── VT-19: ausência de join com perfil/membro_empresa via pg_get_viewdef ─
  it('VT-19: definição da MV NÃO faz join com perfil nem membro_empresa', async () => {
    const r = await db.query<{ def: string }>(
      `select pg_get_viewdef('analytics.mv_rankings_empresa'::regclass) as def`
    )
    const def = r.rows[0]!.def.toLowerCase()

    // RS-P5/CA18b: zero join com perfil (traria nome_publico) ou membro_empresa (traria user_id)
    expect(def, 'join com perfil encontrado — viola RS-P5/CA18b (veto #8)').not.toMatch(/\bjoin\s+perfil\b/)
    expect(def, 'join com membro_empresa encontrado — viola RS-P5/CA18b (veto #8)').not.toMatch(/\bjoin\s+membro_empresa\b/)
  })

  // ── T12: soft-delete e finalizado na definição ────────────────────────────
  it('T12: definição contém deleted_at is null (soft-delete — CA24/RN7)', async () => {
    const r = await db.query<{ def: string }>(
      `select pg_get_viewdef('analytics.mv_rankings_empresa'::regclass) as def`
    )
    const def = r.rows[0]!.def.toLowerCase()
    expect(def).toMatch(/deleted_at\s+is\s+null/)
  })

  it('T12: definição contém status = finalizado (CA25/RN7)', async () => {
    const r = await db.query<{ def: string }>(
      `select pg_get_viewdef('analytics.mv_rankings_empresa'::regclass) as def`
    )
    const def = r.rows[0]!.def.toLowerCase()
    expect(def).toMatch(/finalizado/)
  })

  // ── Dados: empresa X aparece com projetos finalizados ────────────────────
  it('empresa X aparece com projetos_finalizados >= 1', async () => {
    const r = await db.query<{ empresa_id: string; projetos_finalizados: string | number }>(
      `select empresa_id, projetos_finalizados from analytics.mv_rankings_empresa
       where empresa_id = '${IDS.empresaX}'`
    )
    expect(r.rows).toHaveLength(1)
    expect(parseInt(String(r.rows[0]!.projetos_finalizados))).toBeGreaterThanOrEqual(1)
  })

  it('empresa Y NÃO aparece (sem projetos finalizados no seed)', async () => {
    // No seed, empresa Y tem dorPublicadaY → projetoEmExecucao (em_execucao, não finalizado)
    // Logo empresa Y não deve ter projetos_finalizados > 0 → pode não aparecer na MV
    const r = await db.query<{ empresa_id: string }>(
      `select empresa_id from analytics.mv_rankings_empresa
       where empresa_id = '${IDS.empresaY}'`
    )
    // Empresa Y não tem projetos finalizados → não deve aparecer (ou finalizados=0)
    if (r.rows.length > 0) {
      const finalizados = await db.query<{ projetos_finalizados: string | number }>(
        `select projetos_finalizados from analytics.mv_rankings_empresa
         where empresa_id = '${IDS.empresaY}'`
      )
      expect(parseInt(String(finalizados.rows[0]!.projetos_finalizados))).toBe(0)
    }
    // Se não aparece, está correto (só finalizados entram ou aparecem com 0)
  })
})
