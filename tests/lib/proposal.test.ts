import { describe, it, expect } from 'vitest'
import { validateNewProposal, LIMITS } from '@/lib/proposal'
import { validNewProposal } from '../../fixtures/proposal.fixture'

// T1b — RN3 (obrigatórios/opcionais), RN4 (cursos), RS5 (limites/allowlist)
describe('lib/proposal — validateNewProposal', () => {
  it('aceita proposta válida', () => {
    expect(validateNewProposal(validNewProposal)).toEqual([])
  })

  it('exige obrigatórios: repNome, empresa, dor (RN3)', () => {
    const errs = validateNewProposal({ ...validNewProposal, repNome: '  ', empresa: '', dor: '' })
    const fields = errs.map((e) => e.field)
    expect(fields).toContain('repNome')
    expect(fields).toContain('empresa')
    expect(fields).toContain('dor')
  })

  it('opcionais ausentes (departamento/cargo) continuam válidos (RN3)', () => {
    const base = { ...validNewProposal }
    delete (base as Partial<typeof base>).departamento
    delete (base as Partial<typeof base>).cargo
    expect(validateNewProposal(base)).toEqual([])
  })

  it('rejeita campos acima do limite (RS5)', () => {
    const errs = validateNewProposal({ ...validNewProposal, dor: 'x'.repeat(LIMITS.dor + 1) })
    expect(errs.map((e) => e.field)).toContain('dor')
  })

  it('rejeita curso fora da allowlist (RN4/RS5)', () => {
    const errs = validateNewProposal({ ...validNewProposal, cursos: ['medicina' as never] })
    expect(errs.map((e) => e.field)).toContain('cursos')
  })

  it('exige ao menos um curso (ou "Não sei") (RN4)', () => {
    const errs = validateNewProposal({ ...validNewProposal, cursos: [] })
    expect(errs.map((e) => e.field)).toContain('cursos')
  })
})
