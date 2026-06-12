/**
 * T-O3.2 — /app/dores: vitrine + minhas dores
 * TDD RED: tabs WAI-ARIA, vitrine só publicadas, minhas dores por autor,
 * aba "Minhas" oculta a não-autor, status com rótulo+ícone, CTA locked sem verificação.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/dores',
}))

const DOR_PUBLICADA = {
  id: 'dor-pub-1',
  empresa_nome: 'Nissan do Brasil',
  descricao: 'Precisamos de ajuda com automação',
  status: 'publicada' as const,
  cursos: ['engenharia_de_software'],
  publicada_em: '2026-06-01T00:00:00Z',
}

const DOR_MODERACAO = {
  id: 'dor-mod-1',
  empresa_nome: 'Minha Empresa',
  descricao: 'Dor em moderação',
  status: 'em_moderacao' as const,
  cursos: [],
  criada_em: '2026-06-05T00:00:00Z',
}

const DOR_REJEITADA = {
  id: 'dor-rej-1',
  empresa_nome: 'Minha Empresa',
  descricao: 'Dor rejeitada',
  status: 'rejeitada' as const,
  cursos: [],
  criada_em: '2026-06-04T00:00:00Z',
}

import { DoresPage } from '@/components/dores/DoresPage'

describe('DoresPage — T7 (vitrine + minhas dores)', () => {
  it('renderiza a aba Vitrine por padrão', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(screen.getByRole('tab', { name: /vitrine/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /vitrine/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('vitrine mostra dores publicadas', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(screen.getByText('Nissan do Brasil')).toBeInTheDocument()
  })

  it('status sempre tem rótulo textual (não só cor — a11y)', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(screen.getByText(/publicada/i)).toBeInTheDocument()
  })

  it('aba "Minhas dores" é visível para representante', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[DOR_MODERACAO]}
        isRepresentante
        isVerificado
      />
    )
    expect(screen.getByRole('tab', { name: /minhas dores/i })).toBeInTheDocument()
  })

  it('aba "Minhas dores" NÃO aparece para não-representante', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(screen.queryByRole('tab', { name: /minhas dores/i })).toBeNull()
  })

  it('troca para "Minhas dores" ao clicar na aba', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[DOR_MODERACAO, DOR_REJEITADA]}
        isRepresentante
        isVerificado
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: /minhas dores/i }))
    expect(screen.getByText('Dor em moderação')).toBeInTheDocument()
  })

  it('"Minhas dores" mostra todas os estados do autor (moderacao, rejeitada)', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[DOR_MODERACAO, DOR_REJEITADA]}
        isRepresentante
        isVerificado
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: /minhas dores/i }))
    expect(screen.getAllByText(/em modera/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/revisar|rejeitada/i).length).toBeGreaterThan(0)
  })

  it('estado vazio na vitrine exibe mensagem humanizada', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(screen.getByText(/ainda não há dores publicadas/i)).toBeInTheDocument()
  })

  it('CTA "Propor nova dor" fica como ubm-locked para representante não-verificado', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante
        isVerificado={false}
      />
    )
    expect(screen.getByText(/verifique sua conta/i)).toBeInTheDocument()
  })

  it('tabs têm role="tablist", "tab", "tabpanel" (WAI-ARIA)', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[DOR_MODERACAO]}
        isRepresentante
        isVerificado
      />
    )
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('tabpanel')).toBeInTheDocument()
  })

  it('cada dor-card é acessível (link com nome descritivo)', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const link = screen.getByRole('link', { name: /nissan do brasil/i })
    expect(link).toBeInTheDocument()
  })
})
