import { describe, it } from 'vitest'
import { hasSupabaseEnv } from '@/lib/factory'
import { authGatewayContract } from '../../_contracts/auth-gateway.contract'
import { SupabaseAuthGateway } from '@/lib/auth/supabase-auth-gateway'

// T4d / C1 — paridade do adapter Supabase Auth com o contrato. Skip sem env.
if (hasSupabaseEnv()) {
  authGatewayContract(() => new SupabaseAuthGateway())
} else {
  describe.skip('AuthGateway (Supabase) — sem env', () => {
    it('skip', () => {})
  })
}
