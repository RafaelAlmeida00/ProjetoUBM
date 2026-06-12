import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_KEY, hasSupabaseEnv } from './env'

// Client de NAVEGADOR (componentes 'use client': OAuth, Realtime, autocomplete). Chave pública + sessão em cookie.
export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL!, SUPABASE_KEY!)
}

// Há credenciais públicas do Supabase no bundle? (inlined no build p/ NEXT_PUBLIC_*)
export const temSupabaseNoCliente = hasSupabaseEnv
