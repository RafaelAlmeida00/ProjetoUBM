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
 *
 * BUG D1: NavRail via prop `papeis: string[]` (JWT claim não-confiável).
 *   coordenador E aluno veem "Indicações"; representante não.
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
  // ADR-0002: item "Casos" foi removido do NavRail — vitrine unificada em /dores.
  // Os testes de ausência de "Casos" estão em adr0002-vitrine-unificada.test.tsx (T7).

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

// ── BUG D1: papeis array (JWT claim não-confiável) ──────────────────────────
// NavRail deve aceitar `papeis: string[]` para filtro real de visibilidade.
// role=undefined (JWT claim vazio) + papeis=['coordenador'] → deve ver Indicações.

describe('NavRail — BUG D1: prop papeis[] substitui role string', () => {
  it('coordenador via papeis=["coordenador"] vê "Indicações"', () => {
    render(<NavRail papeis={['coordenador']} isAdmin={false} />)
    expect(screen.getByRole('link', { name: /indica[çc][õo]es/i })).toBeInTheDocument()
  })

  it('aluno via papeis=["aluno"] vê "Indicações"', () => {
    render(<NavRail papeis={['aluno']} isAdmin={false} />)
    expect(screen.getByRole('link', { name: /indica[çc][õo]es/i })).toBeInTheDocument()
  })

  it('representante via papeis=["representante"] NÃO vê "Indicações"', () => {
    render(<NavRail papeis={['representante']} isAdmin={false} />)
    expect(screen.queryByRole('link', { name: /indica[çc][õo]es/i })).toBeNull()
  })

  it('coordenador via papeis=["coordenador"] vê "Propor dor" não (sem role representante)', () => {
    render(<NavRail papeis={['coordenador']} isAdmin={false} />)
    expect(screen.queryByRole('link', { name: /propor dor/i })).toBeNull()
  })

  it('representante via papeis=["representante"] vê "Propor dor"', () => {
    render(<NavRail papeis={['representante']} isAdmin={false} />)
    expect(screen.getByRole('link', { name: /propor dor/i })).toBeInTheDocument()
  })

  it('"Propor dor" aponta para a rota INTERNA /app/dores/nova (não a captação anônima /propor)', () => {
    render(<NavRail papeis={['representante']} isAdmin={false} />)
    expect(screen.getByRole('link', { name: /propor dor/i })).toHaveAttribute(
      'href',
      '/app/dores/nova',
    )
  })

  it('role=undefined + papeis=["coordenador"] → coordenador vê Indicações (fix do JWT vazio)', () => {
    render(<NavRail papeis={['coordenador']} isAdmin={false} />)
    expect(screen.getByRole('link', { name: /indica[çc][õo]es/i })).toBeInTheDocument()
  })
})
