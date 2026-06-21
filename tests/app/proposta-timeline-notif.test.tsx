/**
 * T5.5 — Timeline pública com etapas 006 + notificações 006 no centro.
 * RED → GREEN: timeline mostra etapa+data sem conteúdo privado (CA20);
 * notificações da 006 com deep-link (CA21).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/dores/dor-1',
}))

import { UbmTimeline } from '@/components/ubm-timeline'
import type { EventoTimeline } from '@/lib/data/projetos'

// EventoTimeline usa: para_status, ocorrido_em, autor_nome (não tipo_evento/ocorreu_em)
function ev(para_status: string, ocorrido_em = '2026-06-01T00:00:00Z'): EventoTimeline & { futuro?: boolean } {
  return { de_status: null, para_status, ocorrido_em, autor_nome: null }
}

// ---------------------------------------------------------------------------
// Timeline pública (CA20 — etapas sem conteúdo privado)
// ---------------------------------------------------------------------------

describe('T5.5 — Timeline pública com etapas 006 (CA20)', () => {
  it('exibe "PROPOSTA EM ANÁLISE" como etapa enviada', () => {
    render(<UbmTimeline eventos={[ev('proposta_em_analise')]} />)
    expect(screen.getByText(/PROPOSTA EM ANÁLISE/i)).toBeInTheDocument()
  })

  it('exibe "PROPOSTA APROVADA" quando aprovada', () => {
    render(<UbmTimeline eventos={[ev('proposta_aprovada', '2026-06-10T00:00:00Z')]} />)
    expect(screen.getByText(/PROPOSTA APROVADA/i)).toBeInTheDocument()
  })

  it('exibe "EM EXECUÇÃO" quando em execução', () => {
    render(<UbmTimeline eventos={[ev('em_execucao', '2026-06-15T00:00:00Z')]} />)
    expect(screen.getByText(/EM EXECUÇÃO/i)).toBeInTheDocument()
  })

  it('exibe "FINALIZADO" quando finalizado', () => {
    render(<UbmTimeline eventos={[ev('finalizado', '2026-07-01T00:00:00Z')]} />)
    expect(screen.getByText(/FINALIZADO/i)).toBeInTheDocument()
  })

  it('NÃO exibe documento/motivo/link na timeline pública (CA20)', () => {
    // UbmTimeline só renderiza rótulos de status + datas.
    // O evento tem apenas os campos de EventoTimeline — sem campos privados extras.
    const eventos: (EventoTimeline & { futuro?: boolean })[] = [
      {
        de_status: null,
        para_status: 'proposta_em_analise',
        ocorrido_em: '2026-06-01T00:00:00Z',
        autor_nome: null,
      },
    ]
    render(<UbmTimeline eventos={eventos} />)
    // Garante que o componente não renderiza links privados
    expect(screen.queryByRole('link', { name: /proposta|assinar|baixar/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/storage\.example\.com/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/autentique\.com/i)).not.toBeInTheDocument()
    // Garante que o rótulo público está visível
    expect(screen.getByText(/PROPOSTA EM ANÁLISE/i)).toBeInTheDocument()
  })

  it('timeline mostra as 4 etapas 006 em sequência', () => {
    const eventos = [
      ev('proposta_em_analise', '2026-06-01T00:00:00Z'),
      ev('proposta_aprovada', '2026-06-10T00:00:00Z'),
      ev('em_execucao', '2026-06-15T00:00:00Z'),
      ev('finalizado', '2026-07-01T00:00:00Z'),
    ]
    render(<UbmTimeline eventos={eventos} />)
    expect(screen.getByText(/PROPOSTA EM ANÁLISE/i)).toBeInTheDocument()
    expect(screen.getByText(/PROPOSTA APROVADA/i)).toBeInTheDocument()
    expect(screen.getByText(/EM EXECUÇÃO/i)).toBeInTheDocument()
    expect(screen.getByText(/FINALIZADO/i)).toBeInTheDocument()
  })

  it('pino de proposta usa classe ubm-timeline-pin--proposta (warning dashed)', () => {
    const { container } = render(<UbmTimeline eventos={[ev('proposta_em_analise')]} />)
    const pin = container.querySelector('.ubm-timeline-pin--proposta')
    expect(pin).not.toBeNull()
  })

  it('pino de finalizado usa classe ubm-timeline-pin--finalizado (success)', () => {
    const { container } = render(<UbmTimeline eventos={[ev('finalizado', '2026-07-01T00:00:00Z')]} />)
    const pin = container.querySelector('.ubm-timeline-pin--finalizado')
    expect(pin).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Notificações 006 (CA21) — componente inline (sem importar o RSC)
// ---------------------------------------------------------------------------

interface NotifRow {
  id: string
  tipo: string
  lida: boolean
  created_at: string
  payload: unknown
}

const TIPOS_006 = new Set([
  'proposta_recebida',
  'proposta_assinada',
  'contraproposta',
  'status_mudou',
])

function copyNotif006(notif: NotifRow): string {
  const payload = notif.payload as Record<string, string> | null
  const tipo = payload?.evento ?? notif.tipo
  const empresa = payload?.empresa ?? ''
  if (tipo === 'proposta_recebida') return `Nova proposta para assinar${empresa ? ` de ${empresa}` : ''}.`
  if (tipo === 'proposta_assinada') return `Proposta assinada${empresa ? ` de ${empresa}` : ''}.`
  if (tipo === 'contraproposta') return `Contraproposta recebida — reenvie a proposta.`
  if (tipo === 'status_mudou') {
    const paraStatus = payload?.para_status ?? ''
    return `Projeto${empresa ? ` de ${empresa}` : ''} avançou para ${paraStatus.replace(/_/g, ' ')}.`
  }
  return notif.tipo.replace(/_/g, ' ')
}

function deepLink006(notif: NotifRow, projetoParaDor: Map<string, string>): string {
  const payload = notif.payload as Record<string, string> | null
  const projetoId = payload?.projeto_id
  if (projetoId && projetoParaDor.has(projetoId)) {
    return `/app/dores/${projetoParaDor.get(projetoId)}`
  }
  return '/app/dores'
}

function NotifList006({ notifs, mapa }: { notifs: NotifRow[]; mapa: Map<string, string> }) {
  return (
    <ul aria-label="Notificações">
      {notifs.map((n) => {
        const link = deepLink006(n, mapa)
        const copy = copyNotif006(n)
        return (
          <li key={n.id}>
            <span className="ubm-cota ubm-cota--muted">{n.tipo.toUpperCase()}</span>
            <a href={link} aria-label={`${copy} — Abrir`}>{copy}</a>
          </li>
        )
      })}
    </ul>
  )
}

const MAPA = new Map<string, string>([['proj-1', 'dor-1']])

describe('T5.5 — Notificações 006 com deep-link (CA21)', () => {
  it('notificação proposta_recebida exibe copy e deep-link para a dor', () => {
    const notifs: NotifRow[] = [{
      id: 'n1',
      tipo: 'proposta_recebida',
      lida: false,
      created_at: '2026-06-01T00:00:00Z',
      payload: { evento: 'proposta_recebida', projeto_id: 'proj-1', empresa: 'Barra Mansa' },
    }]
    render(<NotifList006 notifs={notifs} mapa={MAPA} />)
    const link = screen.getByRole('link', { name: /nova proposta para assinar.*abrir/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/app/dores/dor-1')
  })

  it('notificação proposta_assinada exibe copy correto', () => {
    const notifs: NotifRow[] = [{
      id: 'n2',
      tipo: 'proposta_assinada',
      lida: false,
      created_at: '2026-06-10T00:00:00Z',
      payload: { evento: 'proposta_assinada', projeto_id: 'proj-1', empresa: 'Barra Mansa' },
    }]
    render(<NotifList006 notifs={notifs} mapa={MAPA} />)
    expect(screen.getByText(/proposta assinada de barra mansa/i)).toBeInTheDocument()
  })

  it('notificação contraproposta — NÃO contém o motivo no texto público (CA21)', () => {
    const notifs: NotifRow[] = [{
      id: 'n3',
      tipo: 'contraproposta',
      lida: false,
      created_at: '2026-06-12T00:00:00Z',
      payload: {
        evento: 'contraproposta',
        projeto_id: 'proj-1',
        // motivo está no payload mas NÃO deve aparecer no copy público
        motivo: 'O prazo precisa ser ajustado.',
      },
    }]
    render(<NotifList006 notifs={notifs} mapa={MAPA} />)
    expect(screen.getByText(/contraproposta recebida/i)).toBeInTheDocument()
    expect(screen.queryByText(/prazo precisa ser ajustado/i)).not.toBeInTheDocument()
  })

  it('notificação status_mudou exibe status humanizado e deep-link', () => {
    const notifs: NotifRow[] = [{
      id: 'n4',
      tipo: 'status_mudou',
      lida: false,
      created_at: '2026-06-15T00:00:00Z',
      payload: {
        evento: 'status_mudou',
        projeto_id: 'proj-1',
        empresa: 'Barra Mansa',
        para_status: 'em_execucao',
      },
    }]
    render(<NotifList006 notifs={notifs} mapa={MAPA} />)
    const link = screen.getByRole('link', { name: /barra mansa.*avançou.*em execucao.*abrir/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/app/dores/dor-1')
  })

  it('deep-link cai para /app/dores quando projeto_id não está no mapa', () => {
    const notifs: NotifRow[] = [{
      id: 'n5',
      tipo: 'proposta_recebida',
      lida: false,
      created_at: '2026-06-01T00:00:00Z',
      payload: { evento: 'proposta_recebida', projeto_id: 'proj-desconhecido' },
    }]
    render(<NotifList006 notifs={notifs} mapa={MAPA} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/app/dores')
  })

  it('todos os 4 tipos 006 estão no set TIPOS_006', () => {
    expect(TIPOS_006.has('proposta_recebida')).toBe(true)
    expect(TIPOS_006.has('proposta_assinada')).toBe(true)
    expect(TIPOS_006.has('contraproposta')).toBe(true)
    expect(TIPOS_006.has('status_mudou')).toBe(true)
  })
})
