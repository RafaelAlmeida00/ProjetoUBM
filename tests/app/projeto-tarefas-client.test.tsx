/**
 * P0.2 — wiring de tarefas em /app/projetos/[id]
 * RED: UbmTaskList integrado ao ProjetoDetalheClient com props tarefas/userId/papel
 * e callbacks criarTarefa/concluirTarefa/editarTarefa/reatribuirTarefa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/projetos/1',
}))

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: vi.fn(), erro: vi.fn(), info: vi.fn(), dispensar: vi.fn() }),
}))

vi.mock('@/lib/actions/equipe', () => ({
  fecharEquipe: vi.fn().mockResolvedValue({ ok: true }),
  trocarHost: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/projeto', () => ({
  avancarProjeto: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/tarefa', () => ({
  criarTarefa: vi.fn().mockResolvedValue({ ok: true, tarefaId: 'nova-tarefa' }),
  editarTarefa: vi.fn().mockResolvedValue({ ok: true }),
  concluirTarefa: vi.fn().mockResolvedValue({ ok: true }),
  reatribuirTarefa: vi.fn().mockResolvedValue({ ok: true }),
}))

import { ProjetoDetalheClient } from '@/components/dores/ProjetoDetalheClient'
import type { FuncaoTarefa, MembroPublico } from '@/lib/data/projetos'
import { criarTarefa, concluirTarefa } from '@/lib/actions/tarefa'

const TAREFA_ATIVA: FuncaoTarefa = {
  id: 'tarefa-1',
  projeto_id: 'proj-1',
  responsavel_id: 'user-eu',
  titulo: 'Elaborar relatório',
  descricao: null,
  concluida: false,
  created_at: '2026-04-01T10:00:00Z',
  deleted_at: null,
}

const MEMBROS: MembroPublico[] = [
  { papel_projeto: 'host', nome_ou_papel: 'Ana Souza', ranking_optin: true },
]

describe('ProjetoDetalheClient — wiring de tarefas (P0.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('membro (aluno) vê UbmTaskList com tarefas quando isMembro=true', () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="aluno"
        projetoStatus="aprovado"
        tarefas={[TAREFA_ATIVA]}
        currentUserId="user-eu"
        equipe={MEMBROS}
        modoTarefas
      />,
    )
    expect(screen.getByText('Elaborar relatório')).toBeInTheDocument()
  })

  it('host vê botão de criar tarefa (+ Criar tarefa)', () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="host"
        projetoStatus="aprovado"
        tarefas={[TAREFA_ATIVA]}
        currentUserId="user-host"
        equipe={MEMBROS}
        modoTarefas
      />,
    )
    // UbmTaskList com papelAtual='host' exibe "+ Criar tarefa"
    expect(screen.getByRole('button', { name: /\+ criar tarefa/i })).toBeInTheDocument()
  })

  it('aluno vê botão concluir tarefa (sua)', () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="aluno"
        projetoStatus="aprovado"
        tarefas={[TAREFA_ATIVA]}
        currentUserId="user-eu"
        equipe={MEMBROS}
        modoTarefas
      />,
    )
    // Botão de check para concluir
    expect(screen.getByRole('button', { name: /marcar como concluída/i })).toBeInTheDocument()
  })

  it('clicar em concluir chama concluirTarefa com id correto', async () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="aluno"
        projetoStatus="aprovado"
        tarefas={[TAREFA_ATIVA]}
        currentUserId="user-eu"
        equipe={MEMBROS}
        modoTarefas
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /marcar como concluída/i }))
    await waitFor(() => expect(concluirTarefa).toHaveBeenCalledWith('tarefa-1'))
  })

  it('sem tarefas e host exibe estado vazio com botão criar', () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="host"
        projetoStatus="aprovado"
        tarefas={[]}
        currentUserId="user-host"
        equipe={MEMBROS}
        modoTarefas
      />,
    )
    expect(screen.getByText(/nenhuma tarefa/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /criar tarefa/i })).toBeInTheDocument()
  })

  it('criar tarefa chama criarTarefa com projetoId e userId como responsável', async () => {
    render(
      <ProjetoDetalheClient
        projetoId="proj-1"
        indicacoes={[]}
        papelAtual="host"
        projetoStatus="aprovado"
        tarefas={[]}
        currentUserId="user-host"
        equipe={MEMBROS}
        modoTarefas
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /criar tarefa/i }))
    const input = screen.getByRole('textbox', { name: /nova tarefa/i })
    fireEvent.change(input, { target: { value: 'Nova tarefa de teste' } })
    fireEvent.click(screen.getByRole('button', { name: /^criar$/i }))
    await waitFor(() =>
      expect(criarTarefa).toHaveBeenCalledWith(
        expect.objectContaining({
          projetoId: 'proj-1',
          titulo: 'Nova tarefa de teste',
        }),
      ),
    )
  })
})
