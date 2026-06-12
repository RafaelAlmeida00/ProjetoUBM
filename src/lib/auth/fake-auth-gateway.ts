import type { AuthUser } from '../proposal'
import type { AuthGateway, OAuthProvider } from './auth-gateway'

/** Adapter de auth determinístico para testes/dev sem OAuth real (ADR-0002/C1). */
export class FakeAuthGateway implements AuthGateway {
  private user: AuthUser | null

  constructor(initial: AuthUser | null = null) {
    this.user = initial
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    return this.user
  }

  async signInWithProvider(provider: OAuthProvider): Promise<AuthUser> {
    this.user = { id: `fake-${provider}-id`, email: `representante.${provider}@empresa.com` }
    return this.user
  }

  async signOut(): Promise<void> {
    this.user = null
  }
}
