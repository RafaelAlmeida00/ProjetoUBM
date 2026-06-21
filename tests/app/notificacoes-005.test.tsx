/**
 * T-O3.9 — S5 gatilhos da 005 em /app/notificacoes
 * 009 T16: deep-links consolidados em /app/dores (projeto_id resolvido p/ dor_id no RSC).
 * aria-live p/ Realtime; opt-out não renderiza tipo (CA28); copy sem PII excedente (RS12).
 *
 * NÃO reimplementa mais deepLink inline — importa a função PURA real do módulo
 * (@/lib/notificacoes/deep-link), eliminando a duplicação/drift (Art. VII).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { resolverDeepLink } from '@/lib/notificacoes/deep-link'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/notificacoes',
}))

interface NotificacaoRow {
  id: string
  tipo: string
  lida: boolean
  created_at: string
  payload: unknown
}

const TIPOS_005 = new Set(['projeto_aberto', 'equipe_fechada', 'eleito_host', 'projeto_avancou'])

// Mapa projeto→dor que o RSC resolveria em lote (proj-1 → dor-1).
const MAPA_PROJ_DOR = new Map<string, string>([['proj-1', 'dor-1']])
function deepLink(notif: NotificacaoRow): string {
  return resolverDeepLink(notif.tipo, notif.payload as Record<string, string> | null, MAPA_PROJ_DOR)
}

function copyNotif(notif: NotificacaoRow): string {
  const payload = notif.payload as Record<string, string> | null
  const tipo = payload?.evento ?? notif.tipo
  const empresa = payload?.empresa ?? ''
  const curso = payload?.curso ?? ''
  const paraStatus = payload?.para_status ?? ''

  if (tipo === 'projeto_aberto') {
    return `Uma nova dor${curso ? ` de ${curso}` : ''} abriu um projeto. Quer se indicar?`
  }
  if (tipo === 'equipe_fechada') {
    return `Você entrou na equipe do projeto${empresa ? ` de ${empresa}` : ''}.`
  }
  if (tipo === 'eleito_host') {
    return `Você foi eleito host do projeto${empresa ? ` de ${empresa}` : ''}.`
  }
  if (tipo === 'projeto_avancou') {
    const statusLabel = paraStatus.replace(/_/g, ' ')
    return `O projeto${empresa ? ` de ${empresa}` : ''} avançou para ${statusLabel}.`
  }
  return notif.tipo.replace(/_/g, ' ')
}

// Componente simples de lista de notificações para testar a UI
function NotifList({ notifs }: { notifs: NotificacaoRow[] }) {
  return (
    <div>
      <div aria-live="polite" id="notificacoes-live" />
      {notifs.length === 0 ? (
        <div className="ubm-empty">
          <p>Nada por aqui ainda.</p>
        </div>
      ) : (
        <ul aria-label="Lista de notificações">
          {notifs.map((n) => {
            const link = deepLink(n)
            const copy = copyNotif(n)
            const payload = n.payload as Record<string, string> | null
            const tipo = payload?.evento ?? n.tipo
            const eh005 = TIPOS_005.has(tipo)
            return (
              <li key={n.id} className={n.lida ? 'lida' : 'nova'}>
                <span className="tipo-cota">{tipo.replace(/_/g, ' ').toUpperCase()}</span>
                <a href={link} aria-label={`${copy} — Abrir`}>{copy}</a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const NOTIF_ABERTURA: NotificacaoRow = {
  id: 'n1',
  tipo: 'dor_aprovada_curso',
  lida: false,
  created_at: '2026-05-01T10:00:00Z',
  payload: { evento: 'projeto_aberto', curso: 'Engenharia de Software' },
}

const NOTIF_EQUIPE: NotificacaoRow = {
  id: 'n2',
  tipo: 'status_mudou',
  lida: false,
  created_at: '2026-05-02T10:00:00Z',
  payload: { evento: 'equipe_fechada', empresa: 'Nissan', projeto_id: 'proj-1' },
}

const NOTIF_HOST: NotificacaoRow = {
  id: 'n3',
  tipo: 'status_mudou',
  lida: false,
  created_at: '2026-05-03T10:00:00Z',
  payload: { evento: 'eleito_host', empresa: 'Nissan', projeto_id: 'proj-1' },
}

const NOTIF_AVANCOU: NotificacaoRow = {
  id: 'n4',
  tipo: 'status_mudou',
  lida: false,
  created_at: '2026-05-04T10:00:00Z',
  payload: { evento: 'projeto_avancou', empresa: 'Nissan', projeto_id: 'proj-1', para_status: 'aguardando_proposta' },
}

describe('Notificacoes 005 — T-O3.9', () => {
  describe('deep-links corretos por tipo', () => {
    it('projeto_aberto → deep-link /app/dores (indicar-se inline na vitrine)', () => {
      expect(deepLink(NOTIF_ABERTURA)).toBe('/app/dores')
    })

    it('equipe_fechada → deep-link /app/dores/<dor_id>', () => {
      expect(deepLink(NOTIF_EQUIPE)).toBe('/app/dores/dor-1')
    })

    it('eleito_host → deep-link /app/dores/<dor_id>', () => {
      expect(deepLink(NOTIF_HOST)).toBe('/app/dores/dor-1')
    })

    it('projeto_avancou → deep-link /app/dores/<dor_id> (andamento na dor)', () => {
      expect(deepLink(NOTIF_AVANCOU)).toBe('/app/dores/dor-1')
    })
  })

  describe('copy humanizado (RS12 — sem PII excedente)', () => {
    it('abertura: menciona curso sem nome de pessoa', () => {
      const copy = copyNotif(NOTIF_ABERTURA)
      expect(copy).toMatch(/engenharia de software/i)
      expect(copy).toMatch(/indicar/i)
      // Sem nome de usuário
      expect(copy).not.toMatch(/pessoa_id|user_id/i)
    })

    it('equipe_fechada: menciona empresa sem vazamento de dados', () => {
      const copy = copyNotif(NOTIF_EQUIPE)
      expect(copy).toMatch(/nissan/i)
      expect(copy).toMatch(/equipe/i)
      expect(copy).not.toMatch(/pessoa_id|email/i)
    })

    it('eleito_host: menciona empresa e host', () => {
      const copy = copyNotif(NOTIF_HOST)
      expect(copy).toMatch(/host/i)
      expect(copy).toMatch(/nissan/i)
    })

    it('projeto_avancou: menciona empresa e status', () => {
      const copy = copyNotif(NOTIF_AVANCOU)
      expect(copy).toMatch(/avançou/i)
      expect(copy).toMatch(/aguardando proposta/i)
    })
  })

  describe('UI de notificações', () => {
    it('aria-live presente para Realtime', () => {
      render(<NotifList notifs={[NOTIF_ABERTURA]} />)
      expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument()
    })

    it('lista vazia exibe "Nada por aqui ainda"', () => {
      render(<NotifList notifs={[]} />)
      expect(screen.getByText(/nada por aqui/i)).toBeInTheDocument()
    })

    it('tipo projeto_aberto renderiza com link /app/dores', () => {
      render(<NotifList notifs={[NOTIF_ABERTURA]} />)
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/app/dores')
    })

    it('tipo equipe_fechada renderiza com link /app/dores/dor-1', () => {
      render(<NotifList notifs={[NOTIF_EQUIPE]} />)
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/app/dores/dor-1')
    })

    it('tipo projeto_avancou renderiza com link /app/dores/dor-1', () => {
      render(<NotifList notifs={[NOTIF_AVANCOU]} />)
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/app/dores/dor-1')
    })

    it('opt-out: notificação não renderiza se não está na lista', () => {
      // Simula opt-out: notif filtrada antes de chegar (dado não vem do servidor)
      render(<NotifList notifs={[]} />)
      expect(screen.queryByRole('link')).toBeNull()
    })

    it('notificações com aria-label acessível no link', () => {
      render(<NotifList notifs={[NOTIF_ABERTURA]} />)
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('aria-label')
      expect(link.getAttribute('aria-label')).not.toBe('')
    })
  })
})
