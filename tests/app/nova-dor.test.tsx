/**
 * Delta 3 — /app/dores/nova + NovaDorForm
 * TDD RED: formulário enxuto (sem e-mail/nome/cargo), empresa pré-selecionada,
 * criar rascunho → redireciona; validações; bloqueado se não-representante.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => '/app/dores/nova',
}))

const { criarDorMock } = vi.hoisted(() => ({
  criarDorMock: vi.fn(),
}))

vi.mock('@/lib/actions/dor', () => ({
  criarDor: (...args: unknown[]) => criarDorMock(...args),
  submeterDor: vi.fn(),
  moderarDor: vi.fn(),
  editarDor: vi.fn(),
}))

import { NovaDorForm } from '@/components/dores/NovaDorForm'

const EMPRESA_UNICA = { id: 'emp-1', nome: 'Acme S.A.' }
const EMPRESA_OUTRA = { id: 'emp-2', nome: 'Beta Ltda.' }

beforeEach(() => {
  pushMock.mockClear()
  criarDorMock.mockClear()
})

describe('NovaDorForm — Delta 3 (criar dor logado)', () => {
  it('exibe empresa pré-selecionada quando há apenas uma (não pede seleção)', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    expect(screen.getByText('Acme S.A.')).toBeInTheDocument()
    // Não deve ter seletor de empresa quando há apenas uma
    expect(screen.queryByRole('combobox', { name: /empresa/i })).toBeNull()
  })

  it('exibe seletor de empresa quando usuário tem mais de uma', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA, EMPRESA_OUTRA]} />)
    expect(screen.getByRole('combobox', { name: /empresa/i })).toBeInTheDocument()
  })

  it('NÃO pede e-mail, nome nem cargo — formulário enxuto', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    expect(screen.queryByLabelText(/e-mail/i)).toBeNull()
    expect(screen.queryByLabelText(/nome/i)).toBeNull()
    expect(screen.queryByLabelText(/cargo/i)).toBeNull()
  })

  it('exibe textarea de descrição com label', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    expect(screen.getByLabelText(/descrição/i)).toBeInTheDocument()
  })

  it('exibe ConsentGate (consentimento LGPD)', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    // ConsentGate tem label com "política de privacidade"
    expect(screen.getByText(/política de privacidade/i)).toBeInTheDocument()
  })

  it('botão "Criar rascunho" começa desabilitado sem descrição e consentimento', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    const btn = screen.getByRole('button', { name: /criar rascunho/i })
    expect(btn).toBeDisabled()
  })

  it('botão fica habilitado com descrição ≥ 10 chars + consentimento', async () => {
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await user.type(screen.getByLabelText(/descrição/i), 'Precisamos de ajuda com automação de processos.')
    // ConsentGate: checkbox dentro do label "Concordo..."
    await user.click(screen.getByRole('checkbox', { name: /concordo/i }))
    expect(screen.getByRole('button', { name: /criar rascunho/i })).toBeEnabled()
  })

  it('valida descrição mínima de 10 caracteres', async () => {
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await user.type(screen.getByLabelText(/descrição/i), 'curto')
    await user.click(screen.getByRole('checkbox', { name: /concordo/i }))
    // Botão ainda desabilitado com descrição < 10 chars
    expect(screen.getByRole('button', { name: /criar rascunho/i })).toBeDisabled()
  })

  it('chama criarDor com empresaId, descricao, consentimento e redireciona ao sucesso', async () => {
    criarDorMock.mockResolvedValue({ ok: true, dorId: 'nova-dor-123' })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await user.type(screen.getByLabelText(/descrição/i), 'Precisamos de ajuda com automação de processos.')
    await user.click(screen.getByRole('checkbox', { name: /concordo/i }))
    await user.click(screen.getByRole('button', { name: /criar rascunho/i }))
    await waitFor(() => {
      expect(criarDorMock).toHaveBeenCalledWith(expect.objectContaining({
        empresaId: 'emp-1',
        descricao: 'Precisamos de ajuda com automação de processos.',
        consentimento: true,
      }))
      expect(pushMock).toHaveBeenCalledWith('/app/dores/nova-dor-123')
    })
  })

  it('exibe loader enquanto envia (botão "Criando…" desabilitado)', async () => {
    let resolveFn!: (v: unknown) => void
    criarDorMock.mockReturnValue(new Promise((r) => { resolveFn = r }))
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await user.type(screen.getByLabelText(/descrição/i), 'Precisamos de ajuda com automação de processos.')
    await user.click(screen.getByRole('checkbox', { name: /concordo/i }))
    await user.click(screen.getByRole('button', { name: /criar rascunho/i }))
    expect(screen.getByRole('button', { name: /criando/i })).toBeDisabled()
    resolveFn({ ok: true, dorId: 'x' })
  })

  it('exibe mensagem de erro quando criarDor falha', async () => {
    criarDorMock.mockResolvedValue({ ok: false, error: 'Você não é representante desta empresa.' })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await user.type(screen.getByLabelText(/descrição/i), 'Precisamos de ajuda com automação de processos.')
    await user.click(screen.getByRole('checkbox', { name: /concordo/i }))
    await user.click(screen.getByRole('button', { name: /criar rascunho/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    )
    expect(screen.getByText(/não é representante/i)).toBeInTheDocument()
  })

  it('estado bloqueado — sem empresas exibe mensagem com link para onboarding', () => {
    render(<NovaDorForm empresas={[]} />)
    // Título com texto "representante"
    expect(screen.getByText(/não é representante de nenhuma empresa/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /cadastro de representante/i })).toBeInTheDocument()
  })

  it('cursos (CourseMultiSelect) é opcional — está presente mas sem obrigação', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    // O fieldset de cursos deve estar presente
    expect(screen.getByRole('group', { name: /cursos/i })).toBeInTheDocument()
  })
})
