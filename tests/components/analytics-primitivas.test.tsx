import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FrescorBadge } from '@/components/analytics/FrescorBadge'
import { EmptyState } from '@/components/analytics/EmptyState'
import { LoadingState } from '@/components/analytics/LoadingState'

// CT-01: FrescorBadge — Velocidade B (carimbo)
describe('FrescorBadge', () => {
  it('CT-01: renderiza carimbo com "HÁ X MIN" dado atualizado_em recente', () => {
    const atualizado = new Date(Date.now() - 5 * 60_000).toISOString()
    render(<FrescorBadge atualizado_em={atualizado} />)
    expect(screen.getByText(/HÁ 5 MIN/i)).toBeInTheDocument()
  })

  it('CT-01: NÃO renderiza quando atualizado_em é null (Velocidade A)', () => {
    const { container } = render(<FrescorBadge atualizado_em={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('CT-01: tem aria-label com carimbo para leitor de tela', () => {
    const atualizado = new Date(Date.now() - 10 * 60_000).toISOString()
    render(<FrescorBadge atualizado_em={atualizado} />)
    const badge = screen.getByRole('status')
    expect(badge).toBeInTheDocument()
  })
})

// CT-02: EmptyState e LoadingState com tokens reais (sem className fantasma)
describe('EmptyState', () => {
  it('CT-02: renderiza com classes de token real (.ubm-empty)', () => {
    const { container } = render(
      <EmptyState titulo="Sem dados" mensagem="Nenhum dado disponível." />
    )
    expect(container.querySelector('.ubm-empty')).toBeInTheDocument()
    expect(screen.getByText('Sem dados')).toBeInTheDocument()
    expect(screen.getByText('Nenhum dado disponível.')).toBeInTheDocument()
  })

  it('CT-02: renderiza CTA quando fornecido', () => {
    render(
      <EmptyState titulo="Vazio" mensagem="Msg." cta={{ label: 'Ir', href: '/ir' }} />
    )
    expect(screen.getByRole('link', { name: 'Ir' })).toBeInTheDocument()
  })
})

describe('LoadingState', () => {
  it('CT-02: renderiza com classe .ubm-skeleton e aria-busy', () => {
    const { container } = render(<LoadingState mensagem="Carregando..." />)
    expect(container.querySelector('.ubm-skeleton')).toBeInTheDocument()
    // aria-busy no container
    const busy = container.querySelector('[aria-busy="true"]')
    expect(busy).toBeInTheDocument()
  })
})
