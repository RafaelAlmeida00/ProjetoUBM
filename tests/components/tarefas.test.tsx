/**
 * T-O3.6 — Componentes UbmTask / UbmTaskList (.ubm-task / .ubm-task-list)
 * TDD RED: aluno edita as suas; as de outro read-only com cota DE OUTRO MEMBRO;
 * host/co reatribuem; concluir = check (micro); criar tarefa por quem pode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/projetos/1',
}))

import { UbmTask, UbmTaskList } from '@/components/ubm-task'
import type { FuncaoTarefa } from '@/lib/data/projetos'

const TAREFA_MINHA: FuncaoTarefa = {
  id: 'tarefa-1',
  projeto_id: 'proj-1',
  responsavel_id: 'user-eu',
  titulo: 'Minha tarefa',
  descricao: null,
  concluida: false,
  created_at: '2026-04-01T10:00:00Z',
  deleted_at: null,
}

const TAREFA_OUTRO: FuncaoTarefa = {
  id: 'tarefa-2',
  projeto_id: 'proj-1',
  responsavel_id: 'user-outro',
  titulo: 'Tarefa de outro membro',
  descricao: null,
  concluida: false,
  created_at: '2026-04-02T10:00:00Z',
  deleted_at: null,
}

const TAREFA_CONCLUIDA: FuncaoTarefa = {
  ...TAREFA_MINHA,
  id: 'tarefa-3',
  titulo: 'Tarefa concluída',
  concluida: true,
}

const mockConcluir = vi.fn()
const mockEditar = vi.fn()
const mockReatribuir = vi.fn()
const mockCriar = vi.fn()

beforeEach(() => {
  mockConcluir.mockReset().mockResolvedValue({ ok: true })
  mockEditar.mockReset().mockResolvedValue({ ok: true })
  mockReatribuir.mockReset().mockResolvedValue({ ok: true })
  mockCriar.mockReset().mockResolvedValue({ ok: true })
})

describe('UbmTask — T-O3.6', () => {
  it('aluno pode editar a sua própria tarefa (botão editar visível)', () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_MINHA}
          currentUserId="user-eu"
          papelAtual="aluno"
          onConcluir={mockConcluir}
          onEditar={mockEditar}
        />
      </ul>,
    )
    expect(screen.getByRole('button', { name: /editar tarefa/i })).toBeInTheDocument()
  })

  it('tarefa de outro membro exibe cota "DE OUTRO MEMBRO" para aluno', () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_OUTRO}
          currentUserId="user-eu"
          papelAtual="aluno"
          onConcluir={mockConcluir}
          onEditar={mockEditar}
        />
      </ul>,
    )
    expect(screen.getAllByText(/DE OUTRO MEMBRO/i).length).toBeGreaterThanOrEqual(1)
  })

  it('tarefa de outro membro NÃO tem botão editar para aluno', () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_OUTRO}
          currentUserId="user-eu"
          papelAtual="aluno"
          onConcluir={mockConcluir}
          onEditar={mockEditar}
        />
      </ul>,
    )
    expect(screen.queryByRole('button', { name: /editar tarefa/i })).toBeNull()
  })

  it('host/co podem editar tarefas de outros membros', () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_OUTRO}
          currentUserId="user-eu"
          papelAtual="host"
          onConcluir={mockConcluir}
          onEditar={mockEditar}
        />
      </ul>,
    )
    expect(screen.getByRole('button', { name: /editar tarefa/i })).toBeInTheDocument()
  })

  it('host/co têm select de reatribuição', () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_MINHA}
          currentUserId="user-eu"
          papelAtual="host"
          membros={[{ id: 'user-outro', label: 'João Outro' }]}
          onReatribuir={mockReatribuir}
        />
      </ul>,
    )
    expect(screen.getByRole('combobox', { name: /reatribuir/i })).toBeInTheDocument()
  })

  it('aluno NÃO tem select de reatribuição', () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_MINHA}
          currentUserId="user-eu"
          papelAtual="aluno"
          membros={[{ id: 'user-outro', label: 'João Outro' }]}
          onReatribuir={mockReatribuir}
        />
      </ul>,
    )
    expect(screen.queryByRole('combobox', { name: /reatribuir/i })).toBeNull()
  })

  it('botão de check chama onConcluir', async () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_MINHA}
          currentUserId="user-eu"
          papelAtual="aluno"
          onConcluir={mockConcluir}
        />
      </ul>,
    )
    fireEvent.click(screen.getByRole('button', { name: /marcar como concluída/i }))
    await waitFor(() => expect(mockConcluir).toHaveBeenCalledWith('tarefa-1'))
  })

  it('tarefa concluída tem check preenchido e botão concluir desabilitado', () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_CONCLUIDA}
          currentUserId="user-eu"
          papelAtual="aluno"
          onConcluir={mockConcluir}
        />
      </ul>,
    )
    const btn = screen.getByRole('button', { name: /tarefa concluída/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('clique em editar abre campo de edição', () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_MINHA}
          currentUserId="user-eu"
          papelAtual="aluno"
          onEditar={mockEditar}
        />
      </ul>,
    )
    fireEvent.click(screen.getByRole('button', { name: /editar tarefa/i }))
    expect(screen.getByRole('textbox', { name: /título da tarefa/i })).toBeInTheDocument()
  })
})

describe('UbmTaskList — T-O3.6', () => {
  it('lista vazia exibe estado vazio humanizado', () => {
    render(
      <UbmTaskList
        tarefas={[]}
        currentUserId="user-eu"
        papelAtual="aluno"
        onCriar={mockCriar}
      />,
    )
    expect(screen.getByText(/nenhuma tarefa/i)).toBeInTheDocument()
  })

  it('lista vazia com aluno exibe botão criar tarefa', () => {
    render(
      <UbmTaskList
        tarefas={[]}
        currentUserId="user-eu"
        papelAtual="aluno"
        onCriar={mockCriar}
      />,
    )
    expect(screen.getByRole('button', { name: /criar tarefa/i })).toBeInTheDocument()
  })

  it('renderiza tarefas ativas (sem deleted_at)', () => {
    const tarefaExcluida: FuncaoTarefa = { ...TAREFA_MINHA, id: 'tarefa-del', deleted_at: '2026-05-01' }
    render(
      <UbmTaskList
        tarefas={[TAREFA_MINHA, tarefaExcluida]}
        currentUserId="user-eu"
        papelAtual="aluno"
      />,
    )
    expect(screen.getByText('Minha tarefa')).toBeInTheDocument()
    // tarefa excluída não aparece
    expect(screen.getAllByRole('listitem').length).toBe(1)
  })

  it('formulário de criação aparece ao clicar em Criar tarefa', () => {
    render(
      <UbmTaskList
        tarefas={[TAREFA_MINHA]}
        currentUserId="user-eu"
        papelAtual="host"
        onCriar={mockCriar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /\+ criar tarefa/i }))
    expect(screen.getByRole('textbox', { name: /nova tarefa/i })).toBeInTheDocument()
  })
})
