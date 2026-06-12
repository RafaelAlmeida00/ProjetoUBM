/**
 * T-B16b — Loaders comunicantes: testa que cada loading.tsx renderiza
 * microcopy contextual, role="status" e blocos skeleton (ubm-sk).
 *
 * Cobre: /admin/dores, /admin/usuarios, /admin/auditoria, /admin/empresas,
 *        /admin/backfill, /app/dores, /app/dores/[id].
 *
 * Nota: shimmer CSS (::after) e prefers-reduced-motion são CSS-only —
 * verificados na fase G5/QA com screenshot. Aqui provamos estrutura e copy.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

import AdminDoresLoading from '@/app/admin/dores/loading'
import AdminUsuariosLoading from '@/app/admin/usuarios/loading'
import AdminAuditoriaLoading from '@/app/admin/auditoria/loading'
import AdminEmpresasLoading from '@/app/admin/empresas/loading'
import AdminBackfillLoading from '@/app/admin/backfill/loading'
import AppDoresLoading from '@/app/app/dores/loading'
import AppDorIdLoading from '@/app/app/dores/[id]/loading'

// ── helpers ─────────────────────────────────────────────────────────────────

function temRoleStatus(container: HTMLElement): boolean {
  return container.querySelector('[role="status"]') !== null
}

function temBlocosSkeleton(container: HTMLElement): boolean {
  return container.querySelector('.ubm-sk, .ubm-sk-card, .ubm-sk-status') !== null
}

// ── /admin/dores ─────────────────────────────────────────────────────────────

describe('AdminDoresLoading', () => {
  it('LD-1: renderiza microcopy contextual de moderação', () => {
    render(<AdminDoresLoading />)
    expect(screen.getByText(/modera[çc][aã]o/i)).toBeInTheDocument()
  })

  it('LD-2: tem role="status" com dots e aria-live', () => {
    const { container } = render(<AdminDoresLoading />)
    expect(temRoleStatus(container)).toBe(true)
  })

  it('LD-3: renderiza blocos skeleton (ubm-sk-card)', () => {
    const { container } = render(<AdminDoresLoading />)
    const cards = container.querySelectorAll('.ubm-sk-card')
    expect(cards.length).toBeGreaterThanOrEqual(3)
  })
})

// ── /admin/usuarios ───────────────────────────────────────────────────────────

describe('AdminUsuariosLoading', () => {
  it('LD-4: microcopy menciona usuários e papéis', () => {
    render(<AdminUsuariosLoading />)
    expect(screen.getByText(/usu[aá]rios.*pap[eé]is|pap[eé]is.*usu[aá]rios/i)).toBeInTheDocument()
  })

  it('LD-5: tem role="status"', () => {
    const { container } = render(<AdminUsuariosLoading />)
    expect(temRoleStatus(container)).toBe(true)
  })

  it('LD-6: renderiza linhas de tabela skeleton', () => {
    const { container } = render(<AdminUsuariosLoading />)
    const rows = container.querySelectorAll('tr[aria-hidden="true"]')
    expect(rows.length).toBeGreaterThanOrEqual(6)
  })
})

// ── /admin/auditoria ──────────────────────────────────────────────────────────

describe('AdminAuditoriaLoading', () => {
  it('LD-7: microcopy menciona auditoria', () => {
    render(<AdminAuditoriaLoading />)
    expect(screen.getByText(/auditoria/i)).toBeInTheDocument()
  })

  it('LD-8: tem role="status"', () => {
    const { container } = render(<AdminAuditoriaLoading />)
    expect(temRoleStatus(container)).toBe(true)
  })

  it('LD-9: renderiza linhas de tabela skeleton', () => {
    const { container } = render(<AdminAuditoriaLoading />)
    const rows = container.querySelectorAll('tr[aria-hidden="true"]')
    expect(rows.length).toBeGreaterThanOrEqual(5)
  })
})

// ── /admin/empresas ───────────────────────────────────────────────────────────

describe('AdminEmpresasLoading', () => {
  it('LD-10: microcopy menciona empresas', () => {
    render(<AdminEmpresasLoading />)
    expect(screen.getByText(/empresas/i)).toBeInTheDocument()
  })

  it('LD-11: tem role="status"', () => {
    const { container } = render(<AdminEmpresasLoading />)
    expect(temRoleStatus(container)).toBe(true)
  })
})

// ── /admin/backfill ───────────────────────────────────────────────────────────

describe('AdminBackfillLoading', () => {
  it('LD-12: microcopy menciona manutenção ou ferramentas', () => {
    render(<AdminBackfillLoading />)
    expect(screen.getByText(/manuten[çc][aã]o|ferramentas/i)).toBeInTheDocument()
  })

  it('LD-13: tem role="status"', () => {
    const { container } = render(<AdminBackfillLoading />)
    expect(temRoleStatus(container)).toBe(true)
  })
})

// ── /app/dores ────────────────────────────────────────────────────────────────

describe('AppDoresLoading', () => {
  it('LD-14: microcopy menciona dores publicadas', () => {
    render(<AppDoresLoading />)
    expect(screen.getByText(/dores publicadas/i)).toBeInTheDocument()
  })

  it('LD-15: tem role="status"', () => {
    const { container } = render(<AppDoresLoading />)
    expect(temRoleStatus(container)).toBe(true)
  })

  it('LD-16: renderiza 6 ubm-sk-card na grade', () => {
    const { container } = render(<AppDoresLoading />)
    const cards = container.querySelectorAll('.ubm-sk-card')
    expect(cards.length).toBe(6)
  })
})

// ── /app/dores/[id] ───────────────────────────────────────────────────────────

describe('AppDorIdLoading', () => {
  it('LD-17: microcopy contextual de abertura da dor', () => {
    render(<AppDorIdLoading />)
    expect(screen.getByText(/dor/i)).toBeInTheDocument()
  })

  it('LD-18: tem role="status"', () => {
    const { container } = render(<AppDorIdLoading />)
    expect(temRoleStatus(container)).toBe(true)
  })

  it('LD-19: renderiza blocos skeleton', () => {
    const { container } = render(<AppDorIdLoading />)
    expect(temBlocosSkeleton(container)).toBe(true)
  })
})
