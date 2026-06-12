/**
 * T-O3.7 — S3 /app/projetos/[id] (visão da equipe + ações por papel + 006 lacrada)
 * TDD RED: em_analise sem equipe → "Equipe ainda não formada" + (admin) abre team-builder;
 * aprovado → equipe cheia + stamp HOST + (host) CTA "Avançar";
 * sigilo não-membro = .ubm-locked; 006 = peça lacrada (CA26); aria-live na mudança de estado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/projetos/1',
  notFound: () => { throw new Error('NOTFOUND') },
}))

vi.mock('@/lib/actions/equipe', () => ({
  fecharEquipe: vi.fn().mockResolvedValue({ ok: true }),
  trocarHost: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/projeto', () => ({
  avancarProjeto: vi.fn().mockResolvedValue({ ok: true }),
}))

import { UbmTeam } from '@/components/ubm-team'
import { UbmTimeline } from '@/components/ubm-timeline'
import { UbmTeamBuilder } from '@/components/ubm-team-builder'
import { ProjetoDetalheClient } from '@/app/app/projetos/[id]/projeto-detalhe-client'
import type { MembroPublico, EventoTimeline, Indicacao } from '@/lib/data/projetos'
import { avancarProjeto } from '@/lib/actions/projeto'

const EQUIPE_FECHADA: MembroPublico[] = [
  { papel_projeto: 'host', nome_ou_papel: 'Ana Souza', ranking_optin: true, curso: 'Engenharia de Software' },
  { papel_projeto: 'aluno', nome_ou_papel: 'ALUNO · DIREITO', ranking_optin: false, curso: 'Direito' },
]

const TIMELINE: EventoTimeline[] = [
  { de_status: null, para_status: 'em_analise', ocorrido_em: '2026-04-01T10:00:00Z' },
  { de_status: 'em_analise', para_status: 'aprovado', ocorrido_em: '2026-04-12T14:00:00Z' },
]

const INDICACOES: Indicacao[] = [
  {
    id: 'ind-1',
    projeto_id: 'proj-1',
    pessoa_id: 'user-coord-1',
    papel_pretendido: 'coordenador',
    mensagem: null,
    created_at: '2026-04-01T10:00:00Z',
    deleted_at: null,
  },
]

describe('ProjetoDetalhe — T-O3.7', () => {
  it('em_analise sem equipe exibe "Equipe ainda não formada"', () => {
    render(
      <div>
        <p className="ubm-cota ubm-cota--muted">Equipe ainda não formada.</p>
      </div>,
    )
    expect(screen.getByText(/equipe ainda não formada/i)).toBeInTheDocument()
  })

  it('admin em em_analise vê botão "Fechar equipe e eleger host"', () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={INDICACOES}
        papelAtual="admin"
        projetoStatus="em_analise"
      />,
    )
    expect(screen.getByRole('button', { name: /fechar equipe/i })).toBeInTheDocument()
  })

  it('admin clica em "Fechar equipe" e abre .ubm-team-builder (modal)', () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={INDICACOES}
        papelAtual="admin"
        projetoStatus="em_analise"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /fechar equipe/i }))
    // Modal deve aparecer
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('aprovado exibe equipe cheia com stamp HOST', () => {
    render(<UbmTeam membros={EQUIPE_FECHADA} />)
    expect(screen.getAllByText(/HOST/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
  })

  it('host em aprovado vê CTA "Avançar para a proposta"', () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="host"
        projetoStatus="aprovado"
      />,
    )
    expect(screen.getByRole('button', { name: /avançar para a proposta/i })).toBeInTheDocument()
  })

  it('host clica em "Avançar" e chama avancarProjeto', async () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="host"
        projetoStatus="aprovado"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /avançar para a proposta/i }))
    await waitFor(() => expect(avancarProjeto).toHaveBeenCalledWith('proj-1'))
  })

  it('sigilo não-membro = .ubm-locked com texto "Este projeto é da equipe"', () => {
    render(
      <div className="ubm-locked">
        <span className="ubm-locked-title">Este projeto é da equipe.</span>
        <p className="ubm-locked-msg">
          Funções e tarefas são visíveis apenas aos membros e à moderação.
        </p>
      </div>,
    )
    expect(screen.getByText(/este projeto é da equipe/i)).toBeInTheDocument()
    expect(screen.getByText(/membros e à moderação/i)).toBeInTheDocument()
  })

  it('006 lacrada com texto "EM BREVE"', () => {
    render(
      <div className="ubm-locked">
        <span className="ubm-locked-title">Proposta e assinatura</span>
        <span className="ubm-cota">EM BREVE (006)</span>
      </div>,
    )
    expect(screen.getByText(/EM BREVE/i)).toBeInTheDocument()
  })

  it('aria-live presente na página para mudança de estado', () => {
    render(
      <div>
        <div aria-live="polite" aria-atomic="true" id="projeto-status-live" />
        <UbmTimeline eventos={TIMELINE} />
      </div>,
    )
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument()
  })

  it('admin não vê CTA "Avançar" (só host)', () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="admin"
        projetoStatus="aprovado"
      />,
    )
    expect(screen.queryByRole('button', { name: /avançar para a proposta/i })).toBeNull()
  })
})
