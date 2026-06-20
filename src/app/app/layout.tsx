import { AppShell } from '@/components/app/AppShell'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getMinhaIdentidade } from '@/lib/actions/onboarding'

/**
 * Layout /app — autenticado. Middleware já barrou não-autenticados.
 * BUG D1: papel lido de papel_usuario (getMinhaIdentidade) em vez do JWT claim
 * (app_metadata.roles não é confiável — custom hook pode não ter populado ainda).
 * Sem env Supabase (dev/test) → shell sem papel (não quebra).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let papeis: string[] = []
  let isAdmin = false

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const meta = user.app_metadata as Record<string, unknown> | undefined
      isAdmin = Boolean(meta?.is_admin)
      // Lê papéis reais da tabela papel_usuario (RLS own-read) — não depende do JWT claim
      const identidade = await getMinhaIdentidade()
      papeis = identidade.papeis
    }
  } catch {
    // sem env → shell sem papel
  }

  return (
    <AppShell papeis={papeis} isAdmin={isAdmin}>
      {children}
    </AppShell>
  )
}
