import { describe, it } from 'vitest'
import { hasSupabaseEnv } from '@/lib/factory'
import { proposalRepositoryContract } from '../../_contracts/proposal-repository.contract'
import { SupabaseProposalRepository } from '@/lib/data/supabase-proposal-repository'

// T4d / C1 — o adapter Supabase passa o MESMO contrato dos mocks (paridade).
// Sem chaves no ambiente → skip automático (rodará no deploy/CI com env).
if (hasSupabaseEnv()) {
  proposalRepositoryContract(() => new SupabaseProposalRepository())
} else {
  describe.skip('ProposalRepository (Supabase) — sem env', () => {
    it('skip', () => {})
  })
}
