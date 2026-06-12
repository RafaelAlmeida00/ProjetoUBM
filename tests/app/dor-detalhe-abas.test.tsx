/**
 * T-O3.8 — Componente UbmTabs + S4 abas EQUIPE/TIMELINE em /app/dores/[id]
 * TDD RED: tabs WAI-ARIA (setas/aria-selected/aria-controls);
 * aba TIMELINE = .ubm-timeline, aba EQUIPE = .ubm-team;
 * estados em_analise vs aprovado; não quebra testes da 004.
 * P1.1: DorDetalhe integra UbmTabs (sem "EM BREVE").
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/dores/1',
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDor: vi.fn().mockResolvedValue({ ok: true }),
  editarDor: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/anexo', () => ({
  removerAnexo: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/components/anexos/AnexoUploader', () => ({
  AnexoUploader: () => <div data-testid="anexo-uploader" />,
}))

vi.mock('@/components/course/CourseMultiSelect', () => ({
  CourseMultiSelect: () => <div data-testid="course-multi-select" />,
}))

import { UbmTabs } from '@/components/ubm-tabs'
import { UbmTimeline } from '@/components/ubm-timeline'
import { UbmTeam } from '@/components/ubm-team'
import type { EventoTimeline, MembroPublico } from '@/lib/data/projetos'

const EVENTOS: EventoTimeline[] = [
  { de_status: null, para_status: 'em_analise', ocorrido_em: '2026-04-01T10:00:00Z' },
]

const MEMBROS: MembroPublico[] = [
  { papel_projeto: 'host', nome_ou_papel: 'Ana Souza', ranking_optin: true, curso: 'Engenharia de Software' },
]

function renderAbas(membros: MembroPublico[] = MEMBROS, eventos: EventoTimeline[] = EVENTOS) {
  return render(
    <UbmTabs
      aria-label="Detalhes do projeto"
      tabs={[
        {
          id: 'timeline',
          label: 'Linha do tempo',
          content: <UbmTimeline eventos={eventos} />,
        },
        {
          id: 'equipe',
          label: 'Equipe',
          content: <UbmTeam membros={membros} />,
        },
      ]}
    />,
  )
}

describe('UbmTabs — T-O3.8', () => {
  it('renderiza tablist com role correto (WAI-ARIA)', () => {
    renderAbas()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('renderiza tabs com role="tab" para cada aba', () => {
    renderAbas()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(2)
  })

  it('aba ativa tem aria-selected="true"', () => {
    renderAbas()
    const primeiraAba = screen.getByRole('tab', { name: /linha do tempo/i })
    expect(primeiraAba).toHaveAttribute('aria-selected', 'true')
  })

  it('aba inativa tem aria-selected="false"', () => {
    renderAbas()
    const segundaAba = screen.getByRole('tab', { name: /equipe/i })
    expect(segundaAba).toHaveAttribute('aria-selected', 'false')
  })

  it('tabpanel renderizado com role="tabpanel"', () => {
    renderAbas()
    expect(screen.getByRole('tabpanel')).toBeInTheDocument()
  })

  it('tab tem aria-controls apontando para o painel correto', () => {
    renderAbas()
    const tabTimeline = screen.getByRole('tab', { name: /linha do tempo/i })
    const controlsId = tabTimeline.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()
    expect(document.getElementById(controlsId!)).toBeInTheDocument()
  })

  it('clicar na aba EQUIPE mostra equipe e oculta timeline', () => {
    renderAbas()
    fireEvent.click(screen.getByRole('tab', { name: /equipe/i }))
    // Aba equipe agora ativa
    expect(screen.getByRole('tab', { name: /equipe/i })).toHaveAttribute('aria-selected', 'true')
    // Conteúdo da equipe visível
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('seta ArrowRight muda foco para próxima aba', () => {
    renderAbas()
    const tabTimeline = screen.getByRole('tab', { name: /linha do tempo/i })
    tabTimeline.focus()
    fireEvent.keyDown(tabTimeline, { key: 'ArrowRight' })
    // Aba equipe deve estar focada e ativa
    expect(screen.getByRole('tab', { name: /equipe/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('seta ArrowLeft volta para aba anterior', () => {
    renderAbas()
    // Vai para aba equipe
    const tabEquipe = screen.getByRole('tab', { name: /equipe/i })
    tabEquipe.focus()
    fireEvent.keyDown(tabEquipe, { key: 'ArrowLeft' })
    // Timeline deve estar ativa
    expect(screen.getByRole('tab', { name: /linha do tempo/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('aba TIMELINE contém .ubm-timeline', () => {
    renderAbas()
    expect(document.querySelector('.ubm-timeline')).toBeInTheDocument()
  })

  it('aba EQUIPE contém .ubm-team após troca', () => {
    renderAbas()
    fireEvent.click(screen.getByRole('tab', { name: /equipe/i }))
    expect(document.querySelector('.ubm-team')).toBeInTheDocument()
  })

  it('estado em_analise sem membros exibe "Equipe ainda em formação"', () => {
    renderAbas([]) // sem membros
    fireEvent.click(screen.getByRole('tab', { name: /equipe/i }))
    expect(screen.getByText(/equipe.*formação|ainda.*equipe|formação/i)).toBeInTheDocument()
  })

  it('estado aprovado com membros exibe equipe completa', () => {
    renderAbas(MEMBROS)
    fireEvent.click(screen.getByRole('tab', { name: /equipe/i }))
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getAllByText(/HOST/i).length).toBeGreaterThanOrEqual(1)
  })

  it('não quebra renderização básica (regressão da 004)', () => {
    // UbmTabs é novo componente — apenas renderiza sem erros
    const { container } = renderAbas()
    expect(container).not.toBeEmptyDOMElement()
  })
})

// ── P1.1 — DorDetalhe integra UbmTabs (sem placeholder "EM BREVE") ──────────
import { DorDetalhe } from '@/components/dores/DorDetalhe'
import type { DorData } from '@/components/dores/DorDetalhe'

const DOR_PUBLICADA: DorData = {
  id: 'dor-1',
  empresa_nome: 'Empresa Teste',
  descricao: 'Descrição da dor',
  status: 'publicada',
  cursos: ['ADS'],
  autor_id: 'user-autor',
}

describe('DorDetalhe — abas EQUIPE/TIMELINE (P1.1)', () => {
  it('renderiza tablist com abas Linha do tempo e Equipe', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="user-qualquer"
        isAdmin={false}
        equipe={MEMBROS}
        timeline={EVENTOS}
      />,
    )
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    // Delta-edição adicionou a aba "Linha do tempo da dor"; a do projeto (005) foi
    // renomeada para "Linha do tempo do projeto" para desambiguar.
    expect(screen.getByRole('tab', { name: 'Linha do tempo da dor' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Linha do tempo do projeto' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /equipe/i })).toBeInTheDocument()
  })

  it('NÃO renderiza "EM BREVE" (placeholder 004 removido)', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="user-qualquer"
        isAdmin={false}
        equipe={MEMBROS}
        timeline={EVENTOS}
      />,
    )
    expect(screen.queryByText(/EM BREVE/i)).toBeNull()
  })

  it('aba timeline do projeto mostra .ubm-timeline', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="user-qualquer"
        isAdmin={false}
        equipe={MEMBROS}
        timeline={EVENTOS}
      />,
    )
    // BUG #1: "Linha do tempo do projeto" é a 1ª/default; clicar nela garante painel visível.
    fireEvent.click(screen.getByRole('tab', { name: 'Linha do tempo do projeto' }))
    expect(document.querySelector('.ubm-timeline')).toBeInTheDocument()
  })

  it('clicar em aba Equipe mostra .ubm-team', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="user-qualquer"
        isAdmin={false}
        equipe={MEMBROS}
        timeline={EVENTOS}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /equipe/i }))
    expect(document.querySelector('.ubm-team')).toBeInTheDocument()
  })
})
