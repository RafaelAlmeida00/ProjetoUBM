/**
 * NavRail — telas 005/007 expostas por papel
 *
 * TDD RED: falha antes de os itens serem adicionados ao NAV_ITEMS.
 *
 * Itens novos:
 *   - 'Casos'         → /casos          (todos logados; sem filtro de role)
 *   - 'Indicações'    → /app/indicacoes  (roles: aluno, coordenador)
 *   - 'Notificações'  → /app/notificacoes (todos logados; sem filtro de role)
 *   - 'Paletas'       → /admin/paletas   (adminOnly)
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/lib/auth/logout', () => ({
  logoutCompleto: vi.fn().mockResolvedValue(undefined),
}))

import { NavRail } from '@/components/app/NavRail'

describe('NavRail — itens 005/007', () => {
  // ── Casos (/casos) ────────────────────────────────────────────────────────

  it('aluno vê "Casos"', () => {
    render(<NavRail role="aluno" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /casos/i })).toBeInTheDocument()
  })

  it('coordenador vê "Casos"', () => {
    render(<NavRail role="coordenador" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /casos/i })).toBeInTheDocument()
  })

  it('representante vê "Casos"', () => {
    render(<NavRail role="representante" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /casos/i })).toBeInTheDocument()
  })

  it('"Casos" aponta para /casos', () => {
    render(<NavRail role="aluno" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /casos/i })).toHaveAttribute('href', '/casos')
  })

  // ── Indicações (/app/indicacoes) ─────────────────────────────────────────

  it('aluno vê "Indicações"', () => {
    render(<NavRail role="aluno" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /indica[çc][õo]es/i })).toBeInTheDocument()
  })

  it('coordenador vê "Indicações"', () => {
    render(<NavRail role="coordenador" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /indica[çc][õo]es/i })).toBeInTheDocument()
  })

  it('representante NÃO vê "Indicações"', () => {
    render(<NavRail role="representante" isAdmin={false} />)
    expect(screen.queryByRole('link', { name: /indica[çc][õo]es/i })).toBeNull()
  })

  it('"Indicações" aponta para /app/indicacoes', () => {
    render(<NavRail role="aluno" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /indica[çc][õo]es/i })).toHaveAttribute(
      'href',
      '/app/indicacoes',
    )
  })

  // ── Notificações (/app/notificacoes) ──────────────────────────────────────

  it('aluno vê "Notificações"', () => {
    render(<NavRail role="aluno" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /notifica[çc][õo]es/i })).toBeInTheDocument()
  })

  it('representante vê "Notificações"', () => {
    render(<NavRail role="representante" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /notifica[çc][õo]es/i })).toBeInTheDocument()
  })

  it('"Notificações" aponta para /app/notificacoes', () => {
    render(<NavRail role="aluno" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /notifica[çc][õo]es/i })).toHaveAttribute(
      'href',
      '/app/notificacoes',
    )
  })

  // ── Paletas (/admin/paletas) ───────────────────────────────────────────────

  it('admin vê "Paletas"', () => {
    render(<NavRail role="admin" isAdmin={true} />)
    expect(screen.getByRole('link', { name: /paletas/i })).toBeInTheDocument()
  })

  it('não-admin NÃO vê "Paletas"', () => {
    render(<NavRail role="aluno" isAdmin={false} />)
    expect(screen.queryByRole('link', { name: /paletas/i })).toBeNull()
  })

  it('"Paletas" aponta para /admin/paletas', () => {
    render(<NavRail role="admin" isAdmin={true} />)
    expect(screen.getByRole('link', { name: /paletas/i })).toHaveAttribute(
      'href',
      '/admin/paletas',
    )
  })
})
