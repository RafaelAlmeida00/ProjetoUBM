// @vitest-environment node
/**
 * T01 — 0078_analytics_schema_privado: schema analytics existe e anon/authenticated sem USAGE
 *
 * RED: schema analytics não existe → has_schema_privilege retorna null/erro.
 * GREEN: schema criado + revoke all → has_schema_privilege = false para anon e authenticated.
 *
 * spec: CA19 · RN13 · RS-B1 · veto-seg #1
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
})
afterEach(async () => { await db.close() })

describe('0078 analytics schema privado — CA19/RS-B1', () => {
  it('schema analytics existe', async () => {
    const r = await db.query<{ exists: boolean }>(
      `select exists(
         select 1 from information_schema.schemata
         where schema_name = 'analytics'
       ) as exists`
    )
    expect(r.rows[0]!.exists).toBe(true)
  })

  it('anon NÃO tem USAGE no schema analytics', async () => {
    const r = await db.query<{ has: boolean }>(
      `select has_schema_privilege('anon', 'analytics', 'USAGE') as has`
    )
    expect(r.rows[0]!.has).toBe(false)
  })

  it('authenticated NÃO tem USAGE no schema analytics', async () => {
    const r = await db.query<{ has: boolean }>(
      `select has_schema_privilege('authenticated', 'analytics', 'USAGE') as has`
    )
    expect(r.rows[0]!.has).toBe(false)
  })
})
