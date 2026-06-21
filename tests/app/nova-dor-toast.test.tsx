/**
 * Domínio C — toast wiring em NovaDorForm
 * Matriz (design-feedback.md §3.2):
 *   criarDor rascunho → toast.sucesso("Rascunho salvo.")
 *   criarDor enviar   → toast.sucesso("Dor enviada para análise.")
 *   criarDor erro     → toast.erro(msg)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => '/app/dores/nova',
}))

// ── Toast spies ────────────────────────────────────────────────────────────────
const toastSucesso = vi.fn()
const toastErro = vi.fn()

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: toastSucesso, erro: toastErro, info: vi.fn(), dispensar: vi.fn() }),
}))

// ── Action mocks ───────────────────────────────────────────────────────────────
const { criarDorMock, submeterDorMock } = vi.hoisted(() => ({
  criarDorMock: vi.fn(),
  submeterDorMock: vi.fn(),
}))

vi.mock('@/lib/actions/dor', () => ({
  criarDor: (...args: unknown[]) => criarDorMock(...args),
  submeterDor: (...args: unknown[]) => submeterDorMock(...args),
  moderarDor: vi.fn(),
  editarDor: vi.fn(),
}))

import { NovaDorForm } from '@/components/dores/NovaDorForm'

const EMPRESA = { id: 'emp-1', nome: 'Acme S.A.' }
const TITULO_VALIDO = 'Automação da linha'
const DESCRICAO_VALIDA = 'Precisamos de ajuda com automação de processos.'

async function preencherValido(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/título do projeto/i), TITULO_VALIDO)
  await user.type(screen.getByLabelText(/descrição/i), DESCRICAO_VALIDA)
  await user.click(screen.getByRole('checkbox', { name: /concordo/i }))
}

beforeEach(() => {
  toastSucesso.mockClear()
  toastErro.mockClear()
  criarDorMock.mockReset()
  submeterDorMock.mockReset()
  submeterDorMock.mockResolvedValue({ ok: true })
  pushMock.mockClear()
})

describe('NovaDorForm — toast: criarDor (enviar)', () => {
  it('enviar com sucesso → toast.sucesso("Dor enviada para análise.")', async () => {
    criarDorMock.mockResolvedValue({ ok: true, dorId: 'nova-1' })
    submeterDorMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /enviar dor/i }))
    await waitFor(() =>
      expect(toastSucesso).toHaveBeenCalledWith('Dor enviada para análise.'),
    )
  })

  it('submeterDor falha → toast.erro com mensagem da action', async () => {
    criarDorMock.mockResolvedValue({ ok: true, dorId: 'nova-2' })
    submeterDorMock.mockResolvedValue({ ok: false, error: 'Conta não verificada.' })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /enviar dor/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith('Conta não verificada.'))
  })

  it('criarDor falha → toast.erro com mensagem da action (não navega)', async () => {
    criarDorMock.mockResolvedValue({ ok: false, error: 'Você não é representante.' })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /enviar dor/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith('Você não é representante.'))
    expect(pushMock).not.toHaveBeenCalled()
  })
})

describe('NovaDorForm — toast: criarDor (rascunho)', () => {
  it('salvar rascunho com sucesso → toast.sucesso("Rascunho salvo.")', async () => {
    criarDorMock.mockResolvedValue({ ok: true, dorId: 'rasc-1' })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /salvar como rascunho/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Rascunho salvo.'))
  })

  it('rascunho — criarDor falha → toast.erro (não navega)', async () => {
    criarDorMock.mockResolvedValue({ ok: false, error: 'Erro interno.' })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /salvar como rascunho/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith('Erro interno.'))
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('rascunho — NÃO chama submeterDor (confirma que o modo está correto)', async () => {
    criarDorMock.mockResolvedValue({ ok: true, dorId: 'rasc-2' })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /salvar como rascunho/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Rascunho salvo.'))
    expect(submeterDorMock).not.toHaveBeenCalled()
  })
})
