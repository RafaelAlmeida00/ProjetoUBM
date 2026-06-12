import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_KEY } from '@/lib/supabase/env'

// Renova a sessão e protege as áreas logadas. SEM env Supabase → no-op (app roda com os mocks do 001).
// Autorização fina (is_admin / verificação) é imposta pela RLS no banco + checagem nos layouts /admin e /app;
// aqui fazemos só o gate de SESSÃO (UX) para não duplicar a verdade que vive no Postgres (ADR-0001/0002).
export async function middleware(req: NextRequest) {
  const url = SUPABASE_URL
  const key = SUPABASE_KEY
  let res = NextResponse.next({ request: req })
  if (!url || !key) return res

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value))
        res = NextResponse.next({ request: req })
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  const path = req.nextUrl.pathname

  // Quem já está logado não fica na landing nem na tela de login → vai para o painel.
  if (user && (path === '/' || path === '/login')) {
    return NextResponse.redirect(new URL('/app', req.url))
  }

  // Áreas logadas exigem sessão.
  if ((path.startsWith('/app') || path.startsWith('/admin')) && !user) {
    const to = req.nextUrl.clone()
    to.pathname = '/login'
    to.searchParams.set('next', path)
    return NextResponse.redirect(to)
  }
  return res
}

export const config = { matcher: ['/', '/login', '/app', '/app/:path*', '/admin', '/admin/:path*'] }
