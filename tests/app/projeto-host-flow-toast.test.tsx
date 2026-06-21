/**
 * Domain B — Toast wiring: ProjetoDetalheClient (equipe/host ops)
 * RED: testa que as acoes de equipe/host disparam toast correto (sucesso/erro).
 * Matrix: elegerHost, trocarHost, fecharEquipe, reabrirIndicacoes, removerMembro, avancarProjeto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/dores/proj-1',
}))

// Mock do ToastProvider (hook)
const toastSucesso = vi.fn()
const toastErro = vi.fn()
vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: toastSucesso, erro: toastErro, info: vi.fn(), dispensar: vi.fn() }),
}))

// Mocks das actions
const elegerHostMock = vi.fn()
const trocarHostMock = vi.fn()
const fecharEquipeMock = vi.fn()
const reabrirMock = vi.fn()
const removerMock = vi.fn()
const avancarMock = vi.fn()

vi.mock('@/lib/actions/equipe', () => ({
  elegerHost: (...a: unknown[]) => elegerHostMock(...a),
  trocarHost: (...a: unknown[]) => trocarHostMock(...a),
  fecharEquipe: (...a: unknown[]) => fecharEquipeMock(...a),
  reabrirIndicacoes: (...a: unknown[]) => reabrirMock(...a),
  removerMembro: (...a: unknown[]) => removerMock(...a),
}))
vi.mock('@/lib/actions/projeto', () => ({
  avancarProjeto: (...a: unknown[]) => avancarMock(...a),
}))
vi.mock('@/lib/actions/tarefa', () => ({
  criarTarefa: vi.fn().mockResolvedValue({ ok: true }),
  editarTarefa: vi.fn().mockResolvedValue({ ok: true }),
  concluirTarefa: vi.fn().mockResolvedValue({ ok: true }),
  reatribuirTarefa: vi.fn().mockResolvedValue({ ok: true }),
}))

import { ProjetoDetalheClient } from '@/components/dores/ProjetoDetalheClient'
import type { Indicacao } from '@/lib/data/projetos'

const INDICACAO_COORD: Indicacao = {
  id: 'ind-1',
  projeto_id: 'proj-1',
  pessoa_id: 'user-coord-1',
  papel_pretendido: 'coordenador',
  mensagem: null,
  created_at: '2026-04-01T10:00:00Z',
  deleted_at: null,
}

beforeEach(() => {
  toastSucesso.mockReset()
  toastErro.mockReset()
  elegerHostMock.mockResolvedValue({ ok: true })
  trocarHostMock.mockResolvedValue({ ok: true })
  fecharEquipeMock.mockResolvedValue({ ok: true })
  reabrirMock.mockResolvedValue({ ok: true })
  removerMock.mockResolvedValue({ ok: true })
  avancarMock.mockResolvedValue({ ok: true })
})

describe('Domain B Toast — reabrirIndicacoes', () => {
  it('sucesso: toast.sucesso("Indicacoes reabertas.")', async () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="admin"
        projetoStatus="aprovado"
        hostElected
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /reabrir indicações/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Indicações reabertas.'))
  })

  it('erro: toast.erro chamado quando reabrirIndicacoes falha', async () => {
    reabrirMock.mockResolvedValue({ ok: false, error: 'Falha no servidor.' })
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="admin"
        projetoStatus="aprovado"
        hostElected
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /reabrir indicações/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalled())
    // Passa o error do servidor (amigável) ou o fallback
    expect(toastErro.mock.calls[0][0]).toBeTruthy()
  })
})

describe('Domain B Toast — removerMembro', () => {
  it('sucesso: toast.sucesso("Membro removido da equipe.")', async () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="host"
        projetoStatus="aprovado"
        hostElected
        currentUserId="p-host"
        gestao={[
          { pessoa_id: 'p-host', nome: 'Host', papel_projeto: 'host' },
          { pessoa_id: 'p-aluno', nome: 'Aluno X', papel_projeto: 'aluno' },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /remover.*aluno/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Membro removido da equipe.'))
  })

  it('erro: toast.erro com mensagem', async () => {
    removerMock.mockResolvedValue({ ok: false, error: 'Sem permissão.' })
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="host"
        projetoStatus="aprovado"
        hostElected
        currentUserId="p-host"
        gestao={[
          { pessoa_id: 'p-host', nome: 'Host', papel_projeto: 'host' },
          { pessoa_id: 'p-aluno', nome: 'Aluno X', papel_projeto: 'aluno' },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /remover.*aluno/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalled())
  })
})

describe('Domain B Toast — avancarProjeto', () => {
  it('sucesso: toast.sucesso("Projeto avancou de estagio.")', async () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="host"
        projetoStatus="aprovado"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /avançar para a proposta/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Projeto avançou de estágio.'))
  })

  it('erro: toast.erro com mensagem', async () => {
    avancarMock.mockResolvedValue({ ok: false, error: 'Não foi possível.' })
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="host"
        projetoStatus="aprovado"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /avançar para a proposta/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalled())
  })
})

describe('Domain B Toast — elegerHost (via ElegerHostModal)', () => {
  it('sucesso: toast.sucesso("Host definido.")', async () => {
    elegerHostMock.mockResolvedValue({ ok: true })
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[INDICACAO_COORD]}
        papelAtual="admin"
        projetoStatus="em_analise"
        hostElected={false}
        nomesIndicados={{ 'user-coord-1': 'Ana Coord' }}
      />,
    )
    // Abre modal de eleger host
    fireEvent.click(screen.getByRole('button', { name: /^eleger host$/i }))
    // Seleciona o coordenador
    const radio = await screen.findByRole('radio', { name: /eleger.*host/i })
    fireEvent.click(radio)
    // Confirma
    fireEvent.click(screen.getByRole('button', { name: /confirmar host/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Host definido.'))
  })

  it('erro: toast.erro quando eleger falha', async () => {
    elegerHostMock.mockResolvedValue({ ok: false, error: 'Erro ao eleger.' })
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[INDICACAO_COORD]}
        papelAtual="admin"
        projetoStatus="em_analise"
        hostElected={false}
        nomesIndicados={{ 'user-coord-1': 'Ana Coord' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^eleger host$/i }))
    const radio = await screen.findByRole('radio', { name: /eleger.*host/i })
    fireEvent.click(radio)
    fireEvent.click(screen.getByRole('button', { name: /confirmar host/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalled())
  })
})

describe('Domain B Toast — trocarHost', () => {
  it('sucesso: toast.sucesso("Host atualizado.")', async () => {
    trocarHostMock.mockResolvedValue({ ok: true })
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[INDICACAO_COORD]}
        papelAtual="admin"
        projetoStatus="aprovado"
        hostElected
        nomesIndicados={{ 'user-coord-1': 'Ana Coord' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /trocar host/i }))
    const radio = await screen.findByRole('radio', { name: /eleger.*host/i })
    fireEvent.click(radio)
    fireEvent.click(screen.getByRole('button', { name: /confirmar host/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Host atualizado.'))
  })
})

describe('Domain B Toast — fecharEquipe (via UbmTeamBuilder)', () => {
  it('sucesso: toast.sucesso("Equipe fechada.")', async () => {
    fecharEquipeMock.mockResolvedValue({ ok: true })
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[INDICACAO_COORD]}
        papelAtual="admin"
        projetoStatus="em_analise"
        hostElected
        hostPessoaId="user-coord-1"
        nomesIndicados={{ 'user-coord-1': 'Ana Coord' }}
      />,
    )
    // Admin com host eleito tem "Fechar equipe (admin)"
    fireEvent.click(screen.getByRole('button', { name: /fechar equipe/i }))
    // Modal de composição abre; confirma sem selecionar membros adicionais
    const btnConfirmar = await screen.findByRole('button', { name: /confirmar equipe/i })
    fireEvent.click(btnConfirmar)
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Equipe fechada.'))
  })

  it('erro: toast.erro quando fecharEquipe falha', async () => {
    fecharEquipeMock.mockResolvedValue({ ok: false, error: 'Falha ao fechar.' })
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[INDICACAO_COORD]}
        papelAtual="admin"
        projetoStatus="em_analise"
        hostElected
        hostPessoaId="user-coord-1"
        nomesIndicados={{ 'user-coord-1': 'Ana Coord' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /fechar equipe/i }))
    const btnConfirmar = await screen.findByRole('button', { name: /confirmar equipe/i })
    fireEvent.click(btnConfirmar)
    await waitFor(() => expect(toastErro).toHaveBeenCalled())
  })
})
