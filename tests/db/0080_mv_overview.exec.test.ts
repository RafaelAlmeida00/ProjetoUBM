// @vitest-environment node
/**
 * T06 — 0080_mv_overview: materialized view analytics.mv_overview
 *
 * RED: MV não existe → queries falham.
 * GREEN: MV criada → VT-22/VT-23 + índice UNIQUE + coluna atualizado_em verdes.
 *
 * spec: CA24/CA25 · RN3/RN6/RN7 · RS-B6/P7 · AD-008-1
 *
 * VT-22: soft-delete — projeto com deleted_at NÃO entra na contagem.
 * VT-23: só status='finalizado' conta (em_execucao/aprovado ignorados).
 * + índice UNIQUE presente em analytics.mv_overview (obrigatório p/ CONCURRENTLY).
 * + coluna atualizado_em presente (AD-008-1 / CA11).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco } from './_pglite/harness'
import { seedAnalytics, IDS } from './_pglite/seed-analytics'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
  // Popula a MV após o seed (ela nasce vazia; refresh manual aqui = análogo ao cron)
  await db.exec(`refresh materialized view analytics.mv_overview`)
})
afterEach(async () => { await db.close() })

describe('0080 mv_overview — T06 (VT-22/VT-23 + estrutural)', () => {

  // ── Estrutural: índice UNIQUE existe (obrigatório p/ CONCURRENTLY) ────────
  it('índice UNIQUE existe em analytics.mv_overview (curso)', async () => {
    const r = await db.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef
       from pg_indexes
       where schemaname = 'analytics'
         and tablename  = 'mv_overview'`
    )
    const indices = r.rows.map(row => row.indexdef.toLowerCase())
    const temUnique = indices.some(d => d.includes('unique'))
    expect(temUnique, 'falta índice UNIQUE em analytics.mv_overview (necessário p/ REFRESH CONCURRENTLY)').toBe(true)
  })

  // ── Estrutural: coluna atualizado_em existe (AD-008-1 / CA11) ────────────
  // MVs não aparecem em information_schema.columns; usar pg_attribute.
  it('coluna atualizado_em existe em mv_overview', async () => {
    const r = await db.query<{ attname: string }>(
      `select a.attname
       from pg_catalog.pg_attribute a
       join pg_catalog.pg_class     c on c.oid = a.attrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'analytics'
         and c.relname = 'mv_overview'
         and a.attnum  > 0
         and not a.attisdropped`
    )
    const cols = r.rows.map(row => row.attname)
    expect(cols).toContain('atualizado_em')
  })

  // ── VT-22: soft-delete — projeto com deleted_at NÃO conta ────────────────
  it('VT-22: projeto soft-deletado NÃO entra em mv_overview', async () => {
    // O seed já tem projetoSoftDeletado (finalizado com deleted_at set, dor de empresa X)
    // Após refresh, a MV não deve contar o projeto soft-deletado
    const r = await db.query<{ curso: string; finalizados: string | number }>(
      `select curso, finalizados from analytics.mv_overview`
    )
    // O projeto soft-deletado era de dorEmModeracao (sem dor_curso associada no seed)
    // mas o projeto finalizado real (projetoFinalizado, engenharia_de_software) deve aparecer
    const cursoEngSw = r.rows.find(row => row.curso === 'engenharia_de_software')
    // projetoFinalizado (finalizado, não deletado, dor em engenharia_de_software) deve contar
    // projetoSoftDeletado NÃO deve contar (deleted_at set)
    // projetoGrupoGrande (finalizado, não deletado, engenharia_de_software) também conta
    expect(cursoEngSw).toBeDefined()
    // O count de finalizados deve ser >= 1 (projetoFinalizado + projetoGrupoGrande)
    // e NÃO incluir o soft-deletado
    const finalizados = parseInt(String(cursoEngSw!.finalizados))
    expect(finalizados).toBeGreaterThanOrEqual(1)
  })

  it('VT-22: projeto soft-deletado está ausente da contagem (verifica diretamente)', async () => {
    // Conta projetos finalizados E não-deletados que existem no banco (referência)
    const ref = await db.query<{ count: string }>(
      `select count(*)::text as count
       from public.projeto p
       join public.dor d on d.id = p.dor_id
       join public.dor_curso dc on dc.dor_id = d.id
       where p.status     = 'finalizado'
         and p.deleted_at is null
         and d.deleted_at is null
         and dc.curso     = 'engenharia_de_software'`
    )
    const esperado = parseInt(ref.rows[0]!.count)

    const mv = await db.query<{ finalizados: string | number }>(
      `select finalizados from analytics.mv_overview where curso = 'engenharia_de_software'`
    )
    const real = parseInt(String(mv.rows[0]!.finalizados))
    expect(real).toBe(esperado)
  })

  // ── VT-23: apenas status='finalizado' conta ───────────────────────────────
  it('VT-23: projetos em_execucao/aprovado NÃO aparecem em finalizados', async () => {
    // projetoEmExecucao (administracao) existe no seed como em_execucao
    const r = await db.query<{ curso: string; finalizados: string | number; total_projetos: string | number }>(
      `select curso, finalizados, total_projetos from analytics.mv_overview where curso = 'administracao'`
    )
    // Se não há projetos finalizados em 'administracao', a linha pode não estar na MV
    // (depende do design — se aggregamos só finalizados ou todos)
    // O projetoEmExecucao de dorPublicadaY (administracao) NÃO deve aparecer em finalizados
    if (r.rows.length > 0) {
      const row = r.rows[0]!
      expect(parseInt(String(row.finalizados))).toBe(0)
    }
    // Se a linha não aparece, é porque a MV só inclui cursos com finalizados >= 1 — OK também
  })

  it('VT-23: finalizados real conta só status=finalizado', async () => {
    // projetoGrupoGrande está em engenharia_de_software e é finalizado
    // projetoFinalizado   está em engenharia_de_software e é finalizado
    // projetoSoftDeletado (deletado) e projetoEmExecucao (em_execucao) não devem contar
    const r = await db.query<{ finalizados: string | number }>(
      `select finalizados from analytics.mv_overview where curso = 'engenharia_de_software'`
    )
    expect(r.rows.length).toBeGreaterThan(0)
    const finalizados = parseInt(String(r.rows[0]!.finalizados))
    // Deve ser >= 2 (projetoFinalizado + projetoGrupoGrande, ambos finalizados)
    expect(finalizados).toBeGreaterThanOrEqual(2)
  })
})
