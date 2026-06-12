import type { AuthUser } from '../proposal'

export type OAuthProvider = 'google' | 'microsoft'

/** Porta de identidade (ADR-0002/ADR-0003). Adapters: Fake (test/dev) e Supabase (deploy, T4d). */
export interface AuthGateway {
  getCurrentUser(): Promise<AuthUser | null>
  signInWithProvider(provider: OAuthProvider): Promise<AuthUser>
  signOut(): Promise<void>
}
