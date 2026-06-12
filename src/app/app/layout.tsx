import { AppShell } from '@/components/app/AppShell'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Layout /app — autenticado. Middleware já barrou não-autenticados.
 * RSC lê o claim do JWT (is_admin, papel) para montar a casca role-aware.
 * Sem env Supabase (dev/test) → shell sem papel (não quebra).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let role: string | undefined
  let isAdmin = false

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const meta = user.app_metadata as Record<string, unknown> | undefined
      isAdmin = Boolean(meta?.is_admin)
      const papeis = meta?.roles as string[] | undefined
      role = papeis?.[0]
    }
  } catch {
    // sem env → shell sem papel
  }

  return (
    <AppShell role={role} isAdmin={isAdmin}>
      {children}
    </AppShell>
  )
}
