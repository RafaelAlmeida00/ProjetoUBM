'use client'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { NavRail } from './NavRail'
import { IdentidadeGate } from '@/components/onboarding/IdentidadeGate'

interface AppShellProps {
  children: React.ReactNode
  role?: string
  isAdmin?: boolean
}

/**
 * T1 — App-shell "Bancada" role-aware.
 * Trilho lateral (ubm-shell-rail) + junta costura 45° + conteúdo (ubm-shell-main).
 * Mobile: trilho vira drawer (foco preso, ESC fecha).
 */
export function AppShell({ children, role, isAdmin }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className={`ubm-shell${isAdmin ? ' ubm-shell--blueprint' : ''}`}>
      {/* TRILHO DESKTOP / DRAWER MOBILE */}
      <aside
        className="ubm-shell-rail"
        id="app-navrail"
      >
        <NavRail role={role} isAdmin={isAdmin} onClose={() => setDrawerOpen(false)} />
      </aside>

      {/* OVERLAY do drawer mobile */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          aria-hidden
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* DRAWER MOBILE (sobrepõe o conteúdo) */}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-64 ubm-shell-rail md:hidden transition-transform duration-240 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        hidden={!drawerOpen || undefined}
      >
        <NavRail
          role={role}
          isAdmin={isAdmin}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="ubm-shell-main">
        {/* TOPBAR MOBILE com hamburguer */}
        <header className="ubm-topbar md:hidden">
          <div className="ubm-topbar-trail">
            <span className="ubm-cota">BANCADA</span>
          </div>
          <div className="ubm-topbar-actions">
            <button
              type="button"
              className="ubm-topbar-burger"
              aria-label={drawerOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={drawerOpen}
              aria-controls="app-navrail"
              onClick={() => setDrawerOpen((o) => !o)}
            >
              {drawerOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <IdentidadeGate>{children}</IdentidadeGate>
        </main>
      </div>
    </div>
  )
}
