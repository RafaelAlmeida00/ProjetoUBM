// Fonte ÚNICA da config pública do Supabase.
// Aceita o nome NOVO do Supabase (PUBLISHABLE) e o antigo (ANON) — a chave pública é segura no cliente.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Há credenciais públicas do Supabase no ambiente? Lê `process.env` A CADA chamada
 * (não os consts acima, que são capturados no load) — assim respeita mutação em runtime/teste.
 */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  )
}
