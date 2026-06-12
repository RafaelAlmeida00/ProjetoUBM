// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco } from './harness'

// O0 / T0.1 — pg_trgm disponível no PGlite (via extensions do construtor). Base do fuzzy (003).
describe('pg_trgm no PGlite', () => {
  it('carrega a extensão e similarity()/operador % funcionam', async () => {
    const db = await novoBanco()
    await db.exec('create extension if not exists pg_trgm')
    const r = await db.query<{ s: number; m: boolean }>(
      `select similarity('nissan','nissan automoveis') s, ('nissan' % 'nissan automoveis') m`,
    )
    expect(r.rows[0]!.s).toBeGreaterThan(0.3)
    expect(r.rows[0]!.m).toBe(true)
    await db.close()
  })
})
