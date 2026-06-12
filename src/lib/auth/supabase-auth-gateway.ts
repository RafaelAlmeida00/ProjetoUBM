import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from '../supabase/env'
import type { AuthUser } from '../proposal'
import type { AuthGateway, OAuthProvider } from './auth-gateway'

// Adapter Supabase Auth (ADR-0003). OAuth Google/Microsoft; e-mail vem do provedor (RN2/AC5).
// Ligação real = deploy (chaves do cliente + provedores no painel Supabase).

function client(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env ausente')
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

export class SupabaseAuthGateway implements AuthGateway {
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data } = await client().auth.getUser()
    const u = data.user
    if (!u || !u.email) return null
    return { id: u.id, email: u.email }
  }

  async signInWithProvider(provider: OAuthProvider): Promise<AuthUser> {
    // Microsoft no Supabase é o provider 'azure'.
    const sbProvider = provider === 'microsoft' ? 'azure' : 'google'
    await client().auth.signInWithOAuth({
      provider: sbProvider,
      options: { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined },
    })
    // O fluxo OAuth redireciona; o usuário é resolvido no callback. Retorno otimista.
    const user = await this.getCurrentUser()
    return user ?? { id: '', email: '' }
  }

  async signOut(): Promise<void> {
    await client().auth.signOut()
  }
}
