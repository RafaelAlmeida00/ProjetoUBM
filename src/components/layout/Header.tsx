'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '../brand/Logo'
import { ThemeToggle } from '../theme/ThemeToggle'
import { SignOutButton } from '../auth/SignOutButton'

export interface HeaderUser {
  nome: string
}

// Header das páginas PÚBLICAS (landing, /login, /propor, etc.). Consciente da sessão:
// logado → "Meu painel" + "Sair"; anônimo → "Entrar".
// Em /app e /admin a casca é o AppShell — o header público não renderiza (evita header duplicado).
export function Header({ user = null }: { user?: HeaderUser | null }) {
  const pathname = usePathname()
  if (pathname?.startsWith('/app') || pathname?.startsWith('/admin')) return null

  return (
    <header className="ubm-header">
      <Link href="/" aria-label="Plataforma UBM — início" className="ubm-header-brand">
        <Logo />
      </Link>
      <nav className="ubm-header-nav">
        {user ? (
          <>
            <Link  href="/app">Meu painel</Link>
            <SignOutButton />
          </>
        ) : (
         <>
          <Link href="/dores">Vitrine de Dores</Link>
          {/* title explica o recurso no menu (revisão de Marketing, 24/09/2026, pendência 4) */}
          <Link href="/rankings" title="Quem mais entrega: alunos, coordenadores e empresas com mais projetos de extensão finalizados">
            Ranking
          </Link>
          <Link href="/login">Entrar</Link>
          </>
        )}
        <ThemeToggle />
      </nav>
    </header>
  )
}
