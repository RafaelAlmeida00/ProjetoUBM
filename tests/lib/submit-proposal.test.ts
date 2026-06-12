import { describe, it, expect } from 'vitest'
import { submitProposal } from '@/lib/submit-proposal'
import { InMemoryProposalRepository } from '@/lib/data/in-memory-proposal-repository'
import { FakeAuthGateway } from '@/lib/auth/fake-auth-gateway'
import type { AuthUser } from '@/lib/proposal'
import { validNewProposal } from '../../fixtures/proposal.fixture'

function gw(user: AuthUser | null) {
  return { auth: new FakeAuthGateway(user), proposals: new InMemoryProposalRepository() }
}
const USER: AuthUser = { id: 'u1', email: 'rep@empresa.com' }

// T4a — validação NO SERVIDOR: AC4/AC5/AC6/AC8, RS1/RS3/RS4/RS5
describe('submitProposal (Server Action)', () => {
  it('sem sessão → erro e nada gravado (AC4/RS1)', async () => {
    const g = gw(null)
    await expect(submitProposal(validNewProposal, g)).rejects.toThrow()
    expect(await g.proposals.listByUser('u1')).toHaveLength(0)
  })

  it('usa o e-mail do auth e ignora o payload (AC5/RS3)', async () => {
    const g = gw(USER)
    const saved = await submitProposal({ ...validNewProposal, empresa: 'ACME' }, g)
    expect(saved.email).toBe('rep@empresa.com')
    expect(saved.userId).toBe('u1')
    expect(saved.empresa).toBe('ACME')
  })

  it('consentimento ausente → erro (AC8/RS4)', async () => {
    const g = gw(USER)
    await expect(submitProposal({ ...validNewProposal, consent: false }, g)).rejects.toThrow()
    expect(await g.proposals.listByUser('u1')).toHaveLength(0)
  })

  it('dados inválidos → erro (RS5)', async () => {
    const g = gw(USER)
    await expect(submitProposal({ ...validNewProposal, dor: '   ' }, g)).rejects.toThrow()
  })

  it('sucesso grava com consent + consentAt do servidor (AC6)', async () => {
    const g = gw(USER)
    const saved = await submitProposal(validNewProposal, g)
    expect(saved.consent).toBe(true)
    expect(saved.consentAt).toBeTruthy()
    expect(saved.id).toBeTruthy()
    expect(await g.proposals.listByUser('u1')).toHaveLength(1)
  })
})
