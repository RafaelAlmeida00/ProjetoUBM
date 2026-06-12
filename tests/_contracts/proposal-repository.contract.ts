import { describe, it, expect } from 'vitest'
import type { ProposalRepository } from '@/lib/data/proposal-repository'
import { validNewProposal } from '../../fixtures/proposal.fixture'

// Contrato compartilhado (C1): roda contra o InMemory (sempre) e, futuramente, contra o Supabase (T4d).
export function proposalRepositoryContract(makeRepo: () => ProposalRepository) {
  describe('ProposalRepository (contrato)', () => {
    it('create gera id + createdAt e usa userId/email do SERVIDOR (RS3/T-02)', async () => {
      const repo = makeRepo()
      const saved = await repo.create({
        proposal: validNewProposal,
        userId: 'user-1',
        email: 'user1@org.com',
        consentAt: '2026-01-01T00:00:00Z',
      })
      expect(saved.id).toBeTruthy()
      expect(saved.createdAt).toBeTruthy()
      expect(saved.userId).toBe('user-1')
      expect(saved.email).toBe('user1@org.com')
      expect(saved.consent).toBe(true)
      expect(saved.consentVersion).toBe('v1')
      expect(saved.consentAt).toBe('2026-01-01T00:00:00Z')
    })

    it('listByUser retorna só as linhas do próprio usuário (ownership — AC6/I-01)', async () => {
      const repo = makeRepo()
      await repo.create({ proposal: validNewProposal, userId: 'a', email: 'a@x.com', consentAt: 't' })
      await repo.create({ proposal: validNewProposal, userId: 'b', email: 'b@x.com', consentAt: 't' })
      const rowsA = await repo.listByUser('a')
      expect(rowsA).toHaveLength(1)
      expect(rowsA[0].userId).toBe('a')
    })
  })
}
