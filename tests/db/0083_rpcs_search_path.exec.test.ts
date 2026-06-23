// @vitest-environment node
/**
 * T18 — 0083_rpcs_analytics: search_path='' em toda RPC definer
 *
 * VT-25: pg_proc.proconfig de toda RPC definer da 008 contém search_path=
 *        (CA20 · RS-B3 · T4/E5 · veto-seg #13).
 *
 * Cobre: get_overview, get_rankings_publicos.
 * spec: CA20 · RS-B3 · veto-seg #13
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

const RPCS_008 = ['get_overview', 'get_rankings_publicos']

describe('0083 rpcs_search_path — T18 (VT-25)', () => {

  // ── VT-25: proconfig contém search_path= ───────────────────────────────
  it('VT-25: toda RPC definer da 008 tem set search_path= em proconfig', async () => {
    const r = await db.query<{ proname: string; proconfig: string[] | null }>(
      `select p.proname, p.proconfig
       from pg_catalog.pg_proc     p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = any($1)`,
      [RPCS_008]
    )

    // Todas as RPCs devem existir
    const encontradas = r.rows.map(row => row.proname)
    for (const rpc of RPCS_008) {
      expect(encontradas, `RPC ${rpc} não encontrada em pg_proc`).toContain(rpc)
    }

    // proconfig deve conter search_path= para cada uma
    for (const row of r.rows) {
      const config = row.proconfig ?? []
      const temSearchPath = config.some(c => c.toLowerCase().includes('search_path'))
      expect(
        temSearchPath,
        `${row.proname} não tem search_path= em proconfig (veto #13 / CA20)`
      ).toBe(true)
    }
  })

  it('VT-25: toda RPC definer da 008 é SECURITY DEFINER (prosecdef=true)', async () => {
    const r = await db.query<{ proname: string; prosecdef: boolean }>(
      `select p.proname, p.prosecdef
       from pg_catalog.pg_proc     p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = any($1)`,
      [RPCS_008]
    )

    for (const row of r.rows) {
      expect(
        row.prosecdef,
        `${row.proname} não é SECURITY DEFINER (veto #13 / RS-B3)`
      ).toBe(true)
    }
  })
})
