/**
 * ADR-0002 — Selo de estágio (EstagioSelo)
 *
 * Testa o componente de selo de estágio da vitrine (Publicada → Virou caso → Finalizado).
 * Os testes da Bancada por papel vivem em `adr0002-bancada.test.tsx` (componente wired
 * `components/app/Bancada.tsx`); a versão duplicada `components/bancada/*` foi removida
 * na reconciliação do Maestro (dois agents tocaram a mesma frente) — Art. VII one-writer.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// ──────────────────────────────────────────────────────────────────────────────
// EstagioSelo
// ──────────────────────────────────────────────────────────────────────────────

import { EstagioSelo, derivarEstagioSelo } from '@/components/dores/EstagioSelo'

describe('EstagioSelo', () => {
  it('não renderiza nada quando estagio é undefined', () => {
    const { container } = render(<EstagioSelo estagio={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza chip "VIROU CASO" para estagio="caso" com classe ubm-status--caso', () => {
    render(<EstagioSelo estagio="caso" />)
    const chip = screen.getByText(/virou caso/i)
    expect(chip).toBeInTheDocument()
    expect(chip.closest('.ubm-status')).toHaveClass('ubm-status--caso')
  })

  it('renderiza chip "FINALIZADO" para estagio="finalizado" com classe ubm-status--finalizado', () => {
    render(<EstagioSelo estagio="finalizado" />)
    const chip = screen.getByText(/finalizado/i)
    expect(chip).toBeInTheDocument()
    expect(chip.closest('.ubm-status')).toHaveClass('ubm-status--finalizado')
  })

  it('inclui ícone com aria-hidden (cor nunca sozinha — a11y)', () => {
    render(<EstagioSelo estagio="caso" />)
    // rótulo textual deve existir independente do ícone
    expect(screen.getByText(/virou caso/i)).toBeInTheDocument()
  })

  it('não renderiza chip "caso" para dor sem projeto (projeto_status undefined)', () => {
    // caso derivado: undefined não deve gerar selo
    const { container } = render(<EstagioSelo estagio={undefined} />)
    expect(container.querySelector('.ubm-status--caso')).toBeNull()
    expect(container.querySelector('.ubm-status--finalizado')).toBeNull()
  })

  it('derivarEstagioSelo retorna "finalizado" para projeto_status="finalizado"', () => {
    expect(derivarEstagioSelo('finalizado')).toBe('finalizado')
  })

  it('derivarEstagioSelo retorna "caso" para projeto_status ativo (ex: "em_analise")', () => {
    expect(derivarEstagioSelo('em_analise')).toBe('caso')
    expect(derivarEstagioSelo('aprovado')).toBe('caso')
    expect(derivarEstagioSelo('aguardando_proposta')).toBe('caso')
  })

  it('derivarEstagioSelo retorna undefined para projeto_status undefined', () => {
    expect(derivarEstagioSelo(undefined)).toBeUndefined()
  })
})
