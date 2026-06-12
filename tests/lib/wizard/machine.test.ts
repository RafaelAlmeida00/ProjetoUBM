import { describe, it, expect } from 'vitest'
import { STEPS, initialState, canAdvance, next, prev, progress, canSubmit } from '@/lib/wizard/machine'
import { validNewProposal } from '../../../fixtures/proposal.fixture'

// T1c — AC1 (1 input/tela + progresso), AC2 (ordem dos campos), AC8 (canSubmit exige consentimento)
describe('lib/wizard/machine', () => {
  it('começa no primeiro passo (repNome) com progresso < 1', () => {
    const s = initialState()
    expect(STEPS[s.stepIndex].field).toBe('repNome')
    expect(progress(s)).toBeLessThan(1)
  })

  it('não avança sem o campo obrigatório do passo (AC1)', () => {
    const s = initialState()
    expect(canAdvance(s)).toBe(false)
    expect(canAdvance({ ...s, data: { repNome: 'Maria' } })).toBe(true)
  })

  it('avança/retrocede; progresso é monotônico ao avançar', () => {
    let s = { ...initialState(), data: { repNome: 'Maria' } }
    const p0 = progress(s)
    s = next(s)
    expect(progress(s)).toBeGreaterThan(p0)
    s = prev(s)
    expect(STEPS[s.stepIndex].field).toBe('repNome')
  })

  it('passos opcionais (departamento/cargo) avançam mesmo vazios (RN3)', () => {
    const idxDep = STEPS.findIndex((d) => d.field === 'departamento')
    expect(canAdvance({ stepIndex: idxDep, data: { repNome: 'M', empresa: 'E' } })).toBe(true)
  })

  it('canSubmit só com obrigatórios + consentimento (AC8)', () => {
    expect(canSubmit({ ...validNewProposal, consent: false })).toBe(false)
    expect(canSubmit(validNewProposal)).toBe(true)
  })
})
