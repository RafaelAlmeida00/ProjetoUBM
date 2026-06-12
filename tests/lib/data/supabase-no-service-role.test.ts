import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// T4d / RS8 / I-03 — o caminho de escrita NUNCA usa service_role (só anon key + sessão sob RLS).
describe('adapter Supabase — sem service_role', () => {
  const src = readFileSync(
    path.resolve(process.cwd(), 'lib/data/supabase-proposal-repository.ts'),
    'utf8',
  )
  it('não referencia service_role nem a env de service role', () => {
    expect(src).not.toMatch(/service_role/i)
    expect(src).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })
  it('usa a chave PÚBLICA (publishable/anon via fonte única), não a de serviço', () => {
    expect(src).toMatch(/SUPABASE_KEY|supabase\/env/)
  })
})
