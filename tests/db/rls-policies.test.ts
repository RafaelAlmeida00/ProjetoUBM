import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// T4c — valida o conteúdo da migração (vitest roda com cwd = workspace/src).
const sql = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/0001_create_proposal.sql'),
  'utf8',
).toLowerCase()

describe('migração proposal + RLS', () => {
  it('cria a tabela proposal (singular) com colunas de consentimento', () => {
    expect(sql).toContain('create table public.proposal')
    expect(sql).toMatch(/consent\s+boolean\s+not\s+null/)
    expect(sql).toContain('consent_version')
    expect(sql).toContain('consent_at')
  })

  it('habilita e força RLS', () => {
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('force row level security')
  })

  it('insert_own exige dono + consentimento (RS4/T-02)', () => {
    expect(sql).toMatch(/with check\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*and\s*consent\s*=\s*true/)
  })

  it('ownership em select/update/delete e nada para anon (deny-by-default I-01/E-01)', () => {
    expect(sql).toContain('using (user_id = auth.uid())')
    expect(sql).not.toContain('to anon')
  })

  it('enum de cursos espelha a lista fechada (inclui nao_sei)', () => {
    expect(sql).toContain('create type curso_ubm as enum')
    expect(sql).toContain("'nao_sei'")
    expect(sql).toContain("'engenharia_de_software'")
  })
})
