import { describe, it, expect, beforeEach } from 'vitest'
import { saveDraft, loadDraft, clearDraft } from '@/lib/wizard/draft'
import { validNewProposal } from '../../../fixtures/proposal.fixture'

// T1d — AC3 (rascunho preservado), RS15 (limpar após gravação)
describe('lib/wizard/draft', () => {
  beforeEach(() => clearDraft())

  it('save→load reidrata os campos (AC3)', () => {
    saveDraft({ repNome: 'Maria', empresa: 'UBM' })
    expect(loadDraft()).toMatchObject({ repNome: 'Maria', empresa: 'UBM' })
  })

  it('clear esvazia o rascunho (RS15)', () => {
    saveDraft(validNewProposal)
    clearDraft()
    expect(loadDraft()).toBeNull()
  })

  it('é resiliente quando localStorage está indisponível (R3)', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    // remove o storage para simular SSR / ambiente sem storage
    // @ts-expect-error - apagando para o teste
    delete globalThis.localStorage
    expect(() => saveDraft({ repNome: 'x' })).not.toThrow()
    expect(loadDraft()).toBeNull()
    if (orig) Object.defineProperty(globalThis, 'localStorage', orig)
  })
})
