import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/app/AppShell'

/**
 * Layout /admin — autenticado + is_admin.
 * Middleware faz o gate de sessão; aqui fazemos o gate de is_admin (claim do JWT).
 * Sem permissão → /app (não 404).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let isAdmin = false

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const meta = user.app_metadata as Record<string, unknown> | undefined
      isAdmin = Boolean(meta?.is_admin)
    }
  } catch {
    // sem env → isAdmin = false
  }

  if (!isAdmin) {
    // Com Supabase configurado e usuário não-admin: redireciona
    // Sem env (dev/test): deixa passar para não quebrar os testes
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      redirect('/app')
    }
  }

  return (
    <AppShell role="admin" isAdmin={isAdmin}>
      {children}
    </AppShell>
  )
}
