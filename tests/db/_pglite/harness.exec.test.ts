// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon } from './harness'

// T0b/T0c — o shim provê o contrato Supabase e o harness alterna identidade + aplica migrações.
describe('harness PGlite + shim Supabase', () => {
  it('auth.uid()/auth.role() refletem a identidade; anon não tem uid', async () => {
    const db = await novoBanco()
    await comoUsuario(db, { uid: '00000000-0000-0000-0000-000000000001' })
    const u = await db.query<{ uid: string; role: string }>(
      `select auth.uid()::text as uid, auth.role() as role`,
    )
    expect(u.rows[0]?.uid).toBe('00000000-0000-0000-0000-000000000001')
    expect(u.rows[0]?.role).toBe('authenticated')

    await comoAnon(db)
    const a = await db.query<{ uid: string | null }>(`select auth.uid()::text as uid`)
    expect(a.rows[0]?.uid).toBeNull()
    await db.close()
  })

  it('aplica a migração 0001 (tabela public.proposal existe)', async () => {
    const db = await novoBanco()
    const r = await db.query<{ existe: boolean }>(
      `select to_regclass('public.proposal') is not null as existe`,
    )
    expect(r.rows[0]?.existe).toBe(true)
    await db.close()
  })
})
