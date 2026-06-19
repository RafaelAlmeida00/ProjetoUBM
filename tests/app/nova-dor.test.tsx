/**
 * Delta 3 + Fix-fluxo — /app/dores/nova + NovaDorForm
 * TDD: formulário enxuto (sem e-mail/nome/cargo), empresa pré-selecionada,
 * DOIS caminhos de saída:
 *   - "Enviar dor"          → criarDor + submeterDor (vai direto a em_moderacao)
 *   - "Salvar como rascunho"→ só criarDor (fica em rascunho, editável depois)
 * validações; bloqueado se não-representante.
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

const EMPRESA_UNICA = { id: 'emp-1', nome: 'Acme S.A.' }
const EMPRESA_OUTRA = { id: 'emp-2', nome: 'Beta Ltda.' }
const DESCRICAO_VALIDA = 'Precisamos de ajuda com automação de processos.'

async function preencherValido(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/descrição/i), DESCRICAO_VALIDA)
  await user.click(screen.getByRole('checkbox', { name: /concordo/i }))
}

beforeEach(() => {
  pushMock.mockClear()
  criarDorMock.mockClear()
  submeterDorMock.mockClear()
  submeterDorMock.mockResolvedValue({ ok: true })
})

describe('NovaDorForm — Delta 3 (criar dor logado)', () => {
  it('exibe empresa pré-selecionada quando há apenas uma (não pede seleção)', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    expect(screen.getByText('Acme S.A.')).toBeInTheDocument()
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
    expect(screen.getByText(/política de privacidade/i)).toBeInTheDocument()
  })
})

describe('NovaDorForm — dois caminhos: enviar vs. salvar rascunho (fix-fluxo)', () => {
  it('expõe AMBOS os botões: "Enviar dor" (primário) e "Salvar como rascunho"', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    expect(screen.getByRole('button', { name: /enviar dor/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salvar como rascunho/i })).toBeInTheDocument()
  })

  it('"Enviar dor" vem À FRENTE de "Salvar como rascunho" na ordem do DOM', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    const enviar = screen.getByRole('button', { name: /enviar dor/i })
    const rascunho = screen.getByRole('button', { name: /salvar como rascunho/i })
    // Enviar precede Rascunho no documento
    expect(
      enviar.compareDocumentPosition(rascunho) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('ambos os botões começam desabilitados sem descrição e consentimento', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    expect(screen.getByRole('button', { name: /enviar dor/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /salvar como rascunho/i })).toBeDisabled()
  })

  it('ambos ficam habilitados com descrição ≥ 10 chars + consentimento', async () => {
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await preencherValido(user)
    expect(screen.getByRole('button', { name: /enviar dor/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /salvar como rascunho/i })).toBeEnabled()
  })

  it('valida descrição mínima de 10 caracteres (botões seguem desabilitados)', async () => {
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await user.type(screen.getByLabelText(/descrição/i), 'curto')
    await user.click(screen.getByRole('checkbox', { name: /concordo/i }))
    expect(screen.getByRole('button', { name: /enviar dor/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /salvar como rascunho/i })).toBeDisabled()
  })

  it('"Enviar dor": cria E submete à moderação, depois redireciona ao detalhe', async () => {
    criarDorMock.mockResolvedValue({ ok: true, dorId: 'nova-dor-123' })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /enviar dor/i }))
    await waitFor(() => {
      expect(criarDorMock).toHaveBeenCalledWith(expect.objectContaining({
        empresaId: 'emp-1',
        descricao: DESCRICAO_VALIDA,
        consentimento: true,
      }))
      expect(submeterDorMock).toHaveBeenCalledWith('nova-dor-123')
      expect(pushMock).toHaveBeenCalledWith('/app/dores/nova-dor-123')
    })
  })

  it('"Salvar como rascunho": cria como rascunho e NÃO submete à moderação', async () => {
    criarDorMock.mockResolvedValue({ ok: true, dorId: 'rasc-9' })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /salvar como rascunho/i }))
    await waitFor(() => {
      expect(criarDorMock).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 'emp-1' }))
      expect(pushMock).toHaveBeenCalledWith('/app/dores/rasc-9')
    })
    expect(submeterDorMock).not.toHaveBeenCalled()
  })

  it('exibe loader "Enviando…" ao enviar (botões desabilitados)', async () => {
    let resolveFn!: (v: unknown) => void
    criarDorMock.mockReturnValue(new Promise((r) => { resolveFn = r }))
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /enviar dor/i }))
    expect(screen.getByRole('button', { name: /enviando/i })).toBeDisabled()
    resolveFn({ ok: true, dorId: 'x' })
  })

  it('exibe loader "Salvando…" ao salvar rascunho', async () => {
    let resolveFn!: (v: unknown) => void
    criarDorMock.mockReturnValue(new Promise((r) => { resolveFn = r }))
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /salvar como rascunho/i }))
    expect(screen.getByRole('button', { name: /salvando/i })).toBeDisabled()
    resolveFn({ ok: true, dorId: 'x' })
  })

  it('exibe mensagem de erro quando criarDor falha (não navega, não submete)', async () => {
    criarDorMock.mockResolvedValue({ ok: false, error: 'Você não é representante desta empresa.' })
    const user = userEvent.setup()
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    await preencherValido(user)
    await user.click(screen.getByRole('button', { name: /enviar dor/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText(/não é representante/i)).toBeInTheDocument()
    expect(submeterDorMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
  })
})

describe('NovaDorForm — bloqueios e opcionais', () => {
  it('estado bloqueado — sem empresas exibe mensagem com link para onboarding', () => {
    render(<NovaDorForm empresas={[]} />)
    expect(screen.getByText(/não é representante de nenhuma empresa/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /cadastro de representante/i })).toBeInTheDocument()
  })

  it('cursos (CourseMultiSelect) é opcional — está presente mas sem obrigação', () => {
    render(<NovaDorForm empresas={[EMPRESA_UNICA]} />)
    expect(screen.getByRole('group', { name: /cursos/i })).toBeInTheDocument()
  })
})
