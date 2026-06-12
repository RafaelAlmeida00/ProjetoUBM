// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// T0a — PGlite (Postgres real em WASM, sem Docker) roda no vitest. Base de todo teste de RLS.
describe('PGlite smoke', () => {
  it('executa SQL real (select 1)', async () => {
    const db = new PGlite()
    const r = await db.query<{ n: number }>('select 1 as n')
    expect(r.rows[0]?.n).toBe(1)
    await db.close()
  })
})
