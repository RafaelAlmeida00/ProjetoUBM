/**
 * T-O3.1 — Componente UbmTimeline (.ubm-timeline)
 * TDD RED: semântica ol/li, nome acessível por etapa, estado nunca só-cor,
 * etapa futura atenuada/não-clicável, cota ATUAL, prefers-reduced-motion.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'

// Mocks de infra
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/dores/1',
}))

import { UbmTimeline } from '@/components/ubm-timeline'
import type { EventoTimeline } from '@/lib/data/projetos'

const EVENTOS: EventoTimeline[] = [
  {
    de_status: null,
    para_status: 'em_analise',
    ocorrido_em: '2026-04-01T10:00:00Z',
    ator: null,
  },
  {
    de_status: 'em_analise',
    para_status: 'aprovado',
    ocorrido_em: '2026-04-12T14:30:00Z',
    ator: 'Coordenador · Eng. de Software',
  },
  {
    de_status: 'aprovado',
    para_status: 'aguardando_proposta',
    ocorrido_em: '2026-05-03T09:15:00Z',
    ator: 'Host · Administração',
  },
]

// Evento com etapa futura (006, não atingida)
const EVENTOS_COM_FUTURO: EventoTimeline[] = [
  ...EVENTOS,
  {
    de_status: 'aguardando_proposta',
    para_status: 'proposta_em_analise',
    ocorrido_em: '', // futura — sem data
    ator: null,
    futuro: true,
  } as EventoTimeline & { futuro: boolean },
]

describe('UbmTimeline — T-O3.1', () => {
  it('renderiza como <ol> semântica', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
    // ol tem listitem
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBe(3)
  })

  it('cada etapa tem nome acessível com estado, data e ator', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    // Deve haver rótulo textual de estado (não só cor)
    expect(screen.getByText(/EM ANÁLISE/i)).toBeInTheDocument()
    expect(screen.getByText(/EQUIPE APROVADA/i)).toBeInTheDocument()
    expect(screen.getByText(/AGUARDANDO PROPOSTA/i)).toBeInTheDocument()
  })

  it('cada etapa tem data legível (não só código ISO)', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    // Deve formatar a data em PT-BR
    expect(screen.getAllByText(/abr.*2026|abril.*2026/i).length).toBeGreaterThan(0)
  })

  it('estado nunca é só cor — rótulo textual sempre presente', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    // Cada etapa com pino deve ter o rótulo textual do estado
    const rotulosEsperados = ['EM ANÁLISE', 'EQUIPE APROVADA', 'AGUARDANDO PROPOSTA']
    rotulosEsperados.forEach((rotulo) => {
      expect(screen.getByText(new RegExp(rotulo, 'i'))).toBeInTheDocument()
    })
  })

  it('ator é renderizado quando presente', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    expect(screen.getByText(/Coordenador · Eng\. de Software/i)).toBeInTheDocument()
  })

  it('marca a etapa atual com cota ATUAL', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    // A última etapa recebe cota ATUAL
    expect(screen.getByText(/ATUAL/i)).toBeInTheDocument()
  })

  it('etapa futura fica atenuada/não-clicável (aria-disabled ou classe future)', () => {
    render(<UbmTimeline eventos={EVENTOS_COM_FUTURO as EventoTimeline[]} />)
    // Deve renderizar a etapa futura mas sinalizar como não-ativa
    // Procura pelo rótulo PROPOSTA EM ANÁLISE
    const futuraEl = screen.getByText(/PROPOSTA EM ANÁLISE/i)
    expect(futuraEl).toBeInTheDocument()
    // O elemento (ou um ancestral) deve ter classe future ou aria-disabled
    const li = futuraEl.closest('li')
    expect(li).not.toBeNull()
    expect(
      li!.classList.contains('ubm-timeline-step--future') ||
      li!.getAttribute('aria-disabled') === 'true' ||
      li!.getAttribute('data-future') === 'true'
    ).toBe(true)
  })

  it('etapa futura não é clicável (sem link ativo)', () => {
    render(<UbmTimeline eventos={EVENTOS_COM_FUTURO as EventoTimeline[]} />)
    const futuraEl = screen.getByText(/PROPOSTA EM ANÁLISE/i)
    const li = futuraEl.closest('li')
    // Não deve ter um botão/link ativo dentro
    const link = li!.querySelector('a:not([aria-disabled="true"])')
    expect(link).toBeNull()
  })

  it('etapa futura exibe cota "A SEGUIR"', () => {
    render(<UbmTimeline eventos={EVENTOS_COM_FUTURO as EventoTimeline[]} />)
    expect(screen.getByText(/A SEGUIR/i)).toBeInTheDocument()
  })

  it('timeline é append-only — sem controles de edição', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    // Não deve haver botão editar, apagar, ou qualquer input
    expect(screen.queryByRole('button', { name: /editar|apagar|remover|excluir/i })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('rodapé de imutabilidade presente', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    // BUG #3: microcopy atualizado pelo ux-ui ("Histórico permanente · não editável")
    expect(screen.getByText(/histórico permanente|não editável/i)).toBeInTheDocument()
  })

  it('lista vazia exibe estado vazio (não erro)', () => {
    render(<UbmTimeline eventos={[]} />)
    // Deve exibir mensagem humanizada — não jogar erro
    expect(screen.queryByRole('alert')).toBeNull()
    // Deve ter o container da timeline (mesmo vazio)
    expect(document.querySelector('.ubm-timeline')).toBeInTheDocument()
  })

  it('respeita prefers-reduced-motion via classe ou atributo no container', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    const timeline = document.querySelector('.ubm-timeline')
    expect(timeline).toBeInTheDocument()
    // O container deve existir (o CSS global cuida do reduced-motion)
    // O componente não deve injetar animação inline quando reduced-motion ativo
    // (o CSS @media prefers-reduced-motion já está no globals.css)
    // Testamos que não há style animation inline forçado
    const liItems = document.querySelectorAll('.ubm-timeline-step')
    liItems.forEach((li) => {
      const style = (li as HTMLElement).style.animation
      // Se houver style inline de animation, deve ser vazio (deixar p/ CSS media query)
      expect(style === '' || style === undefined).toBe(true)
    })
  })
})
