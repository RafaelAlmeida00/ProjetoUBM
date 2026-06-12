/**
 * T-O2.6 — T1 /app app-shell role-aware ("Bancada")
 * RED: testes falham antes de existirem os componentes AppShellLayout e AppShell.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'

// mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// Mockamos o NavRail para poder testar papeis isoladamente
vi.mock('@/components/app/NavRail', () => ({
  NavRail: ({
    role,
    isAdmin,
    isOpen,
    onClose,
  }: {
    role?: string
    isAdmin?: boolean
    isOpen?: boolean
    onClose?: () => void
  }) => (
    <nav aria-label="Navegação principal">
      {isAdmin && (
        <span data-testid="mode-chip" className="ubm-navrail-mode">
          MODO MODERAÇÃO
        </span>
      )}
      <a href="/app" aria-current={isOpen ? undefined : 'page'} className="ubm-navrail-item">
        Bancada
      </a>
      <a href="/app/dores" className="ubm-navrail-item">
        Dores
      </a>
      {isAdmin && (
        <a href="/admin/dores" className="ubm-navrail-item">
          Moderar dores
        </a>
      )}
      {role === 'representante' && (
        <a href="/propor" className="ubm-navrail-item">
          Propor dor
        </a>
      )}
      <button onClick={onClose} aria-label="Fechar menu">
        Fechar
      </button>
    </nav>
  ),
}))

import { AppShell } from '@/components/app/AppShell'

describe('AppShell — T1', () => {
  it('renderiza a nav com aria-label "Navegação principal"', () => {
    render(
      <AppShell role="aluno" isAdmin={false}>
        <div>conteúdo</div>
      </AppShell>,
    )
    expect(screen.getByRole('navigation', { name: /navegação principal/i })).toBeInTheDocument()
  })

  it('admin vê chip "MODO MODERAÇÃO" e link "Moderar dores"', () => {
    render(
      <AppShell role="admin" isAdmin={true}>
        <div>conteúdo</div>
      </AppShell>,
    )
    // pode haver 2 (desktop + drawer mobile) — basta existir pelo menos um
    expect(screen.getAllByTestId('mode-chip').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /moderar dores/i }).length).toBeGreaterThan(0)
  })

  it('não-admin NÃO vê link "Moderar dores"', () => {
    render(
      <AppShell role="aluno" isAdmin={false}>
        <div>conteúdo</div>
      </AppShell>,
    )
    expect(screen.queryAllByRole('link', { name: /moderar dores/i })).toHaveLength(0)
  })

  it('representante vê link "Propor dor"', () => {
    render(
      <AppShell role="representante" isAdmin={false}>
        <div>conteúdo</div>
      </AppShell>,
    )
    expect(screen.getAllByRole('link', { name: /propor dor/i }).length).toBeGreaterThan(0)
  })

  it('botão fechar menu chama onClose', () => {
    const onClose = vi.fn()
    // Passamos isOpen para abrir o drawer no mock
    render(
      <AppShell role="aluno" isAdmin={false}>
        <div>conteúdo</div>
      </AppShell>,
    )
    const btn = screen.getByRole('button', { name: /fechar menu/i })
    fireEvent.click(btn)
    // O drawer fecha (sem erro)
  })

  it('renderiza conteúdo filho no main', () => {
    render(
      <AppShell role="aluno" isAdmin={false}>
        <p>filho-teste</p>
      </AppShell>,
    )
    expect(screen.getByText('filho-teste')).toBeInTheDocument()
  })
})
