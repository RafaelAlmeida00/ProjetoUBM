import { describe, it, expect } from 'vitest'
import type { AuthGateway } from '@/lib/auth/auth-gateway'

// Contrato compartilhado (C1): roda contra o Fake (sempre) e, futuramente, contra o Supabase (T4d).
export function authGatewayContract(makeGateway: () => AuthGateway) {
  describe('AuthGateway (contrato)', () => {
    it('sem login, getCurrentUser é null (fail-closed — AC4)', async () => {
      const g = makeGateway()
      expect(await g.getCurrentUser()).toBeNull()
    })

    it('após signIn expõe AuthUser com e-mail (AC5/RN2)', async () => {
      const g = makeGateway()
      const u = await g.signInWithProvider('google')
      expect(u.email).toMatch(/@/)
      expect(await g.getCurrentUser()).toEqual(u)
    })

    it('signOut limpa a sessão', async () => {
      const g = makeGateway()
      await g.signInWithProvider('microsoft')
      await g.signOut()
      expect(await g.getCurrentUser()).toBeNull()
    })
  })
}
