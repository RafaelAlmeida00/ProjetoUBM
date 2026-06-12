import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_KEY } from './env'

// Client de SERVIDOR (RSC + Server Actions): usa a sessão do usuário via cookies → RLS aplica.
// ADR-0001: caminho normal do usuário usa a anon key + sessão, nunca service_role.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    SUPABASE_URL!,
    SUPABASE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // chamado de um RSC (sem permissão de escrever cookie) — ok, o middleware renova a sessão
          }
        },
      },
    },
  )
}
