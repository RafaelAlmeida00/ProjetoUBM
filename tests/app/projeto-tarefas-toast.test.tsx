/**
 * Domain B — Toast wiring: UbmTask / UbmTaskList
 * RED: testa que as acoes de tarefa disparam toast correto (sucesso/erro).
 * Matrix: criarTarefa, editarTarefa, concluirTarefa, reatribuirTarefa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/dores/proj-1',
}))

// Mock do ToastProvider (hook)
const toastSucesso = vi.fn()
const toastErro = vi.fn()
vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: toastSucesso, erro: toastErro, info: vi.fn(), dispensar: vi.fn() }),
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

const mockConcluir = vi.fn()
const mockEditar = vi.fn()
const mockReatribuir = vi.fn()
const mockCriar = vi.fn()

beforeEach(() => {
  toastSucesso.mockReset()
  toastErro.mockReset()
  mockConcluir.mockReset().mockResolvedValue({ ok: true })
  mockEditar.mockReset().mockResolvedValue({ ok: true })
  mockReatribuir.mockReset().mockResolvedValue({ ok: true })
  mockCriar.mockReset().mockResolvedValue({ ok: true })
})

describe('Domain B Toast — concluirTarefa', () => {
  it('sucesso: toast.sucesso("Tarefa concluida.")', async () => {
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
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Tarefa concluída.'))
  })

  it('erro: toast.erro quando concluir falha', async () => {
    mockConcluir.mockResolvedValue({ ok: false, error: 'Falha ao concluir.' })
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
    await waitFor(() => expect(toastErro).toHaveBeenCalled())
    expect(toastErro.mock.calls[0][0]).toMatch(/concluir|possível/i)
  })
})

describe('Domain B Toast — editarTarefa', () => {
  it('sucesso: toast.sucesso("Tarefa atualizada.")', async () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_MINHA}
          currentUserId="user-eu"
          papelAtual="aluno"
          onEditar={mockEditar}
          onConcluir={mockConcluir}
        />
      </ul>,
    )
    fireEvent.click(screen.getByRole('button', { name: /editar tarefa/i }))
    const input = screen.getByRole('textbox', { name: /título da tarefa/i })
    fireEvent.change(input, { target: { value: 'Titulo editado' } })
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Tarefa atualizada.'))
  })

  it('erro: toast.erro quando editar falha', async () => {
    mockEditar.mockResolvedValue({ ok: false, error: 'Erro de salvamento.' })
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_MINHA}
          currentUserId="user-eu"
          papelAtual="aluno"
          onEditar={mockEditar}
          onConcluir={mockConcluir}
        />
      </ul>,
    )
    fireEvent.click(screen.getByRole('button', { name: /editar tarefa/i }))
    const input = screen.getByRole('textbox', { name: /título da tarefa/i })
    fireEvent.change(input, { target: { value: 'Titulo editado' } })
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalled())
    expect(toastErro.mock.calls[0][0]).toBeTruthy()
  })
})

describe('Domain B Toast — reatribuirTarefa', () => {
  it('sucesso: toast.sucesso("Tarefa reatribuida.")', async () => {
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_MINHA}
          currentUserId="user-eu"
          papelAtual="host"
          membros={[{ id: 'user-outro', label: 'Outro' }]}
          onReatribuir={mockReatribuir}
        />
      </ul>,
    )
    const select = screen.getByRole('combobox', { name: /reatribuir/i })
    fireEvent.change(select, { target: { value: 'user-outro' } })
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Tarefa reatribuída.'))
  })

  it('erro: toast.erro quando reatribuir falha', async () => {
    mockReatribuir.mockResolvedValue({ ok: false, error: 'Sem permissão.' })
    render(
      <ul>
        <UbmTask
          tarefa={TAREFA_MINHA}
          currentUserId="user-eu"
          papelAtual="host"
          membros={[{ id: 'user-outro', label: 'Outro' }]}
          onReatribuir={mockReatribuir}
        />
      </ul>,
    )
    const select = screen.getByRole('combobox', { name: /reatribuir/i })
    fireEvent.change(select, { target: { value: 'user-outro' } })
    await waitFor(() => expect(toastErro).toHaveBeenCalled())
    expect(toastErro.mock.calls[0][0]).toBeTruthy()
  })
})

describe('Domain B Toast — criarTarefa (UbmTaskList)', () => {
  it('sucesso: toast.sucesso("Tarefa criada.")', async () => {
    render(
      <UbmTaskList
        tarefas={[]}
        currentUserId="user-eu"
        papelAtual="host"
        onCriar={mockCriar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /criar tarefa/i }))
    const input = screen.getByRole('textbox', { name: /nova tarefa/i })
    fireEvent.change(input, { target: { value: 'Nova tarefa' } })
    fireEvent.click(screen.getByRole('button', { name: /^criar$/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Tarefa criada.'))
  })

  it('erro: toast.erro quando criar falha', async () => {
    mockCriar.mockResolvedValue({ ok: false, error: 'Erro de criacao.' })
    render(
      <UbmTaskList
        tarefas={[]}
        currentUserId="user-eu"
        papelAtual="host"
        onCriar={mockCriar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /criar tarefa/i }))
    const input = screen.getByRole('textbox', { name: /nova tarefa/i })
    fireEvent.change(input, { target: { value: 'Nova tarefa' } })
    fireEvent.click(screen.getByRole('button', { name: /^criar$/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalled())
    expect(toastErro.mock.calls[0][0]).toBeTruthy()
  })
})
