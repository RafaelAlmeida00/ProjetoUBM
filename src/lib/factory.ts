import { FakeAuthGateway } from './auth/fake-auth-gateway'
import { InMemoryProposalRepository } from './data/in-memory-proposal-repository'
import { SupabaseAuthGateway } from './auth/supabase-auth-gateway'
import { SupabaseProposalRepository } from './data/supabase-proposal-repository'
import { hasSupabaseEnv } from './supabase/env'
import type { AuthGateway } from './auth/auth-gateway'
import type { ProposalRepository } from './data/proposal-repository'

export interface Gateways {
  auth: AuthGateway
  proposals: ProposalRepository
}

// Fonte única da detecção de env (aceita PUBLISHABLE e ANON) — ver lib/supabase/env.ts
export { hasSupabaseEnv }

/**
 * Seleciona adapters por ambiente (ADR-0002): sem chaves → mocks (test/dev/CI).
 * T4d ligará os adapters Supabase reais quando `hasSupabaseEnv()` for true.
 */
export function getGateways(): Gateways {
  if (hasSupabaseEnv()) {
    return {
      auth: new SupabaseAuthGateway(),
      proposals: new SupabaseProposalRepository(),
    }
  }
  // Sem chaves (dev/test/CI) → mocks determinísticos (ADR-0002).
  return {
    auth: new FakeAuthGateway(),
    proposals: new InMemoryProposalRepository(),
  }
}
