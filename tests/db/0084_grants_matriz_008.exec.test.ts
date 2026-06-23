// @vitest-environment node
/**
 * T19 — 0084_hardening_grants_008: matriz de grants para RPCs analytics
 *
 * get_overview: NÃO executável por anon; executável por authenticated.
 * get_rankings_publicos: executável por anon E authenticated.
 *
 * spec: CA22/CA23 · RS-C1/E1/E2 · veto-seg #11/#12
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco } from './_pglite/harness'
import { seedAnalytics, IDS } from './_pglite/seed-analytics'
import { comoAnon, comoUsuario, negado } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
  await db.exec(`
    refresh materialized view analytics.mv_overview;
    refresh materialized view analytics.mv_rankings_publico;
    refresh materialized view analytics.mv_rankings_empresa;
  `)
})
afterEach(async () => { await db.close() })

describe('0084 grants_matriz_008 — T19 (CA22/CA23)', () => {

  // ── get_overview: anon NÃO pode executar (veto #11) ────────────────────
  it('get_overview NÃO executável por anon (has_function_privilege=false)', async () => {
    const r = await db.query<{ pode: boolean }>(
      `select has_function_privilege('anon', 'public.get_overview()', 'EXECUTE') as pode`
    )
    expect(Boolean(r.rows[0]!.pode)).toBe(false)
  })

  it('get_overview NÃO executável por anon via chamada direta (negado)', async () => {
    await comoAnon(db)
    expect(await negado(db.query(`select * from public.get_overview()`))).toBe(true)
  })

  // ── get_overview: authenticated PODE executar (gate interno filtra papel)
  it('get_overview executável por authenticated (has_function_privilege=true)', async () => {
    const r = await db.query<{ pode: boolean }>(
      `select has_function_privilege('authenticated', 'public.get_overview()', 'EXECUTE') as pode`
    )
    expect(Boolean(r.rows[0]!.pode)).toBe(true)
  })

  // ── get_rankings_publicos: anon PODE executar (veto #12) ───────────────
  it('get_rankings_publicos executável por anon (has_function_privilege=true)', async () => {
    const r = await db.query<{ pode: boolean }>(
      `select has_function_privilege('anon', 'public.get_rankings_publicos()', 'EXECUTE') as pode`
    )
    expect(Boolean(r.rows[0]!.pode)).toBe(true)
  })

  it('get_rankings_publicos executável por authenticated (has_function_privilege=true)', async () => {
    const r = await db.query<{ pode: boolean }>(
      `select has_function_privilege('authenticated', 'public.get_rankings_publicos()', 'EXECUTE') as pode`
    )
    expect(Boolean(r.rows[0]!.pode)).toBe(true)
  })

  it('get_rankings_publicos executável por anon via chamada direta', async () => {
    await comoAnon(db)
    const r = await db.query(`select * from public.get_rankings_publicos()`)
    expect(Array.isArray(r.rows)).toBe(true)
  })
})
