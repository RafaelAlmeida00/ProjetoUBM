/**
 * T-O3.3 — /app/dores/[id]: visão da dor (parcial — timeline/equipe é 005)
 * TDD RED: dor publicada visível a leitor, rejeitada mostra motivo ao autor,
 * terceiro vê locked (motivo não vaza), aprovada-aguardando mostra ponte.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: vi.fn(), erro: vi.fn(), info: vi.fn(), dispensar: vi.fn() }),
}))

const submeterDorMock = vi.fn()
vi.mock('@/lib/actions/dor', () => ({
  submeterDor: (...args: unknown[]) => submeterDorMock(...args),
  moderarDor: vi.fn(),
  submeterDorLanding: vi.fn(),
}))

import { DorDetalhe } from '@/components/dores/DorDetalhe'

const DOR_BASE = {
  id: 'dor-1',
  empresa_nome: 'Nissan do Brasil',
  descricao: 'Precisamos de ajuda com automação de processos industriais para reduzir erros.',
  status: 'publicada' as const,
  cursos: ['engenharia_mecanica'],
  publicada_em: '2026-06-01T00:00:00Z',
  criada_em: '2026-05-30T00:00:00Z',
  aprovado_por: 'admin-1',
  motivo_rejeicao: null,
  autor_id: 'user-autor',
}

describe('DorDetalhe — T8 (visão da dor parcial)', () => {
  it('dor publicada exibe empresa, descrição e status (visível a leitor)', () => {
    render(
      <DorDetalhe dor={DOR_BASE} currentUserId={null} isAdmin={false} />
    )
    expect(screen.getByText('Nissan do Brasil')).toBeInTheDocument()
    expect(screen.getByText(/automação de processos/i)).toBeInTheDocument()
    // "Publicada" aparece no StatusDor badge e em "Publicada em ..." — ambos indicam status presente
    expect(screen.getAllByText(/publicada/i).length).toBeGreaterThan(0)
  })

  it('dor publicada exibe cursos sugeridos', () => {
    render(
      <DorDetalhe dor={DOR_BASE} currentUserId={null} isAdmin={false} />
    )
    expect(screen.getByText(/engenharia mec/i)).toBeInTheDocument()
  })

  it('dor rejeitada mostra motivo ao AUTOR (CA19)', () => {
    const dorRejeitada = {
      ...DOR_BASE,
      status: 'rejeitada' as const,
      publicada_em: null,
      aprovado_por: null,
      motivo_rejeicao: 'Dor mal formulada, precisa de mais detalhes.',
    }
    render(
      <DorDetalhe dor={dorRejeitada} currentUserId="user-autor" isAdmin={false} />
    )
    expect(screen.getByText(/motivo da revisão/i)).toBeInTheDocument()
    expect(screen.getByText(/mal formulada/i)).toBeInTheDocument()
  })

  it('dor rejeitada exibe CTA "Corrigir e reenviar" para o autor (CA9)', () => {
    const dorRejeitada = {
      ...DOR_BASE,
      status: 'rejeitada' as const,
      publicada_em: null,
      aprovado_por: null,
      motivo_rejeicao: 'Precisa de mais detalhes.',
    }
    render(
      <DorDetalhe dor={dorRejeitada} currentUserId="user-autor" isAdmin={false} />
    )
    expect(screen.getByRole('button', { name: /corrigir e reenviar/i })).toBeInTheDocument()
  })

  it('reenviar chama submeterDor ao clicar', async () => {
    submeterDorMock.mockResolvedValue({ ok: true })
    const dorRejeitada = {
      ...DOR_BASE,
      status: 'rejeitada' as const,
      publicada_em: null,
      aprovado_por: null,
      motivo_rejeicao: 'Precisa de mais detalhes.',
    }
    render(
      <DorDetalhe dor={dorRejeitada} currentUserId="user-autor" isAdmin={false} />
    )
    fireEvent.click(screen.getByRole('button', { name: /corrigir e reenviar/i }))
    await waitFor(() =>
      expect(submeterDorMock).toHaveBeenCalledWith('dor-1')
    )
  })

  it('terceiro vê peça lacrada (locked) e NÃO o motivo de rejeição (CA18)', () => {
    const dorRejeitada = {
      ...DOR_BASE,
      status: 'rejeitada' as const,
      publicada_em: null,
      aprovado_por: null,
      motivo_rejeicao: 'Conteúdo impróprio.',
    }
    render(
      <DorDetalhe dor={dorRejeitada} currentUserId="outro-user" isAdmin={false} />
    )
    expect(screen.getByText(/não está pública/i)).toBeInTheDocument()
    expect(screen.queryByText(/conteúdo impróprio/i)).toBeNull()
  })

  it('não-autenticado vê locked em dor não-publicada (CA18)', () => {
    const dorMod = {
      ...DOR_BASE,
      status: 'em_moderacao' as const,
      publicada_em: null,
      aprovado_por: null,
    }
    render(
      <DorDetalhe dor={dorMod} currentUserId={null} isAdmin={false} />
    )
    expect(screen.getByText(/não está pública/i)).toBeInTheDocument()
  })

  it('aprovada-aguardando mostra ponte para verificar e-mail ao autor (CA10/A1)', () => {
    const dorAprovadaAguardando = {
      ...DOR_BASE,
      status: 'em_moderacao' as const,
      publicada_em: null,
      aprovado_por: 'admin-1',
    }
    render(
      <DorDetalhe dor={dorAprovadaAguardando} currentUserId="user-autor" isAdmin={false} />
    )
    // "Aprovada!" aparece no bloco ponte E no StatusDor "Aprovada · Aguarda Verificação"
    expect(screen.getAllByText(/aprovada/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/verificar/i)).toBeInTheDocument()
  })

  it('timeline/equipe aparece como abas reais (005 — substitui o placeholder "EM BREVE")', () => {
    render(
      <DorDetalhe dor={DOR_BASE} currentUserId={null} isAdmin={false} />
    )
    // P1.1 (005): o placeholder "EM BREVE (005)" foi substituído por UbmTabs.
    // 009 T12: seção "Linha do tempo e equipe" → "Andamento e equipe" (projeto dissolve na dor).
    expect(screen.getByText(/andamento e equipe/i)).toBeInTheDocument()
    // BUG #1: projeto 1ª/default ("Andamento"); dor 2ª; equipe 3ª
    expect(screen.getByRole('tab', { name: 'Linha do tempo da dor' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Andamento' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /equipe/i })).toBeInTheDocument()
    expect(screen.queryByText(/em breve/i)).toBeNull()
  })

  it('dor com status tem rótulo textual (nunca só cor — a11y)', () => {
    render(
      <DorDetalhe dor={DOR_BASE} currentUserId={null} isAdmin={false} />
    )
    // "Publicada" no StatusDor badge e "Publicada em ..." no subtítulo — ambos ok para a11y
    expect(screen.getAllByText(/publicada/i).length).toBeGreaterThan(0)
  })
})
