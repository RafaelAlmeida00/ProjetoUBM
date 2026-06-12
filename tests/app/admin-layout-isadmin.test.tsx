/**
 * I1 — AdminLayout: isAdmin || true (hack de debug vazando)
 * Testa que o AppShell recebe isAdmin=false quando o usuário não é admin,
 * e que o aria-hidden no-op foi removido do AppShell.
 *
 * RED: com `isAdmin={isAdmin || true}` no layout, o AppShell SEMPRE renderiza o
 *      chrome admin ("ubm-shell--blueprint") independente da prop real.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// Mock mínimo do IdentidadeGate para não precisar do Supabase
vi.mock('@/components/onboarding/IdentidadeGate', () => ({
  IdentidadeGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/app/NavRail', () => ({
  NavRail: ({ isAdmin }: { isAdmin?: boolean }) => (
    <nav aria-label="Navegação principal">
      {isAdmin ? (
        <span data-testid="admin-chrome">admin</span>
      ) : (
        <span data-testid="non-admin-chrome">non-admin</span>
      )}
    </nav>
  ),
}))

import { AppShell } from '@/components/app/AppShell'

describe('AppShell — I1: prop isAdmin reflete valor real (sem || true)', () => {
  it('I1-RED: isAdmin=false → NÃO renderiza chrome admin (sem class ubm-shell--blueprint)', () => {
    const { container } = render(
      <AppShell role="admin" isAdmin={false}>
        <div>conteúdo</div>
      </AppShell>,
    )
    // Com isAdmin=false, a div raiz NÃO deve ter a classe blueprint
    const shell = container.querySelector('.ubm-shell')
    expect(shell?.classList.contains('ubm-shell--blueprint')).toBe(false)
    // O NavRail recebe isAdmin=false (pode haver 2 instâncias desktop+drawer, nenhuma admin)
    expect(screen.queryAllByTestId('admin-chrome')).toHaveLength(0)
    expect(screen.getAllByTestId('non-admin-chrome').length).toBeGreaterThan(0)
  })

  it('I1-GREEN: isAdmin=true → renderiza chrome admin (class ubm-shell--blueprint)', () => {
    const { container } = render(
      <AppShell role="admin" isAdmin={true}>
        <div>conteúdo</div>
      </AppShell>,
    )
    const shell = container.querySelector('.ubm-shell')
    expect(shell?.classList.contains('ubm-shell--blueprint')).toBe(true)
    expect(screen.getAllByTestId('admin-chrome').length).toBeGreaterThan(0)
  })
})

describe('AppShell — aria-hidden no-op removido (menor)', () => {
  it('aside app-navrail não tem aria-hidden definido (no-op removido)', () => {
    const { container } = render(
      <AppShell role="aluno" isAdmin={false}>
        <div>conteúdo</div>
      </AppShell>,
    )
    const aside = container.querySelector('aside[id="app-navrail"]')
    expect(aside).toBeTruthy()
    // após a correção, aria-hidden deve estar ausente (não como no-op)
    expect(aside?.hasAttribute('aria-hidden')).toBe(false)
  })
})
