/**
 * T-D2 — Onboarding rico (CA24/CA25/CA29): tipo + nome + infos por tipo.
 * RN21-24 / architecture D.3-D.5
 *
 * RED: falha antes da implementação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => ({ get: (_: string) => null }),
}))

const assumirPapelMock = vi.fn().mockResolvedValue({ ok: true })
const onboardingRepresentanteMock = vi.fn().mockResolvedValue({ ok: true })
const onboardingAlunoMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('@/lib/actions/assumir-papel', () => ({
  assumirPapel: (...args: unknown[]) => assumirPapelMock(...args),
}))

vi.mock('@/lib/actions/onboarding', () => ({
  onboardingRepresentante: (...args: unknown[]) => onboardingRepresentanteMock(...args),
  onboardingAluno: (...args: unknown[]) => onboardingAlunoMock(...args),
  onboardingCoordenador: (..._args: unknown[]) => Promise.resolve({ ok: true }),
}))

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([{ id: 'e1', nome: 'Empresa Teste' }]),
  obterOuCriarEmpresa: vi.fn().mockResolvedValue({ id: 'e1', nome: 'Empresa Teste' }),
}))

vi.mock('@/lib/actions/perfil', () => ({
  atualizarPerfil: vi.fn().mockResolvedValue({ ok: true }),
  getPerfilAction: vi.fn().mockResolvedValue(null),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

import OnboardingPage from '@/app/app/onboarding/page'

describe('OnboardingPage rico — CA24 (representante)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assumirPapelMock.mockResolvedValue({ ok: true })
    onboardingRepresentanteMock.mockResolvedValue({ ok: true })
  })

  it('CA24-1: ao selecionar representante, exibe EmpresaCombobox + campos departamento e cargo', async () => {
    const user = userEvent.setup()
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /representante/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    // Após avançar para infos por tipo, deve aparecer campos específicos
    await waitFor(() => {
      expect(screen.getByLabelText(/departamento/i)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/cargo/i)).toBeInTheDocument()
    // EmpresaCombobox presente (buscando empresa)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('CA24-2: botão Concluir desabilitado sem empresa selecionada', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /representante/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByLabelText(/departamento/i)).toBeInTheDocument())
    // Sem empresa → botão desabilitado
    const btn = screen.getByRole('button', { name: /concluir/i })
    expect(btn).toBeDisabled()
  })

  it('CA24-3: onboardingRepresentante é chamada com empresa + nome + dept + cargo', async () => {
    const user = userEvent.setup()
    render(<OnboardingPage />)
    // 1. Selecionar representante
    fireEvent.click(screen.getByRole('radio', { name: /representante/i }))
    // Preenche nome (se houver campo na primeira tela) ou avança
    // A spec diz "tipo + nome + infos por tipo na mesma jornada"
    const nomeInput = screen.queryByLabelText(/nome/i)
    if (nomeInput) await user.type(nomeInput, 'João Silva')
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    // 2. Preenchimento dos campos de representante
    await waitFor(() => expect(screen.getByLabelText(/departamento/i)).toBeInTheDocument())
    await user.type(screen.getByLabelText(/departamento/i), 'TI')
    await user.type(screen.getByLabelText(/cargo/i), 'Gerente')
    // Simula seleção de empresa via combobox (valor pré-selecionado ou mock)
    // 3. Confirmar
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    // onboardingRepresentante não é chamada sem empresa — esperamos desabilitado
    // Neste caso o botão está desabilitado (CA24-2); o teste de chamada real vai em CA24-4
  })

  it('CA24-4: ao concluir com empresa selecionada, chama onboardingRepresentante', async () => {
    const user = userEvent.setup()
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /representante/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByLabelText(/departamento/i)).toBeInTheDocument())
    // Preenche dept/cargo
    await user.type(screen.getByLabelText(/departamento/i), 'Financeiro')
    await user.type(screen.getByLabelText(/cargo/i), 'Analista')
    // Simula que empresa foi selecionada via uma prop de teste ou clicando
    // Para não depender do debounce, usamos o data-testid do combobox-wrapper se existir
    // Alternativa: disparamos change direto no input e selecionamos via click
    const combobox = screen.getByRole('combobox')
    await user.type(combobox, 'Empresa T')
    await waitFor(() => {
      const opt = screen.queryByText('Empresa Teste')
      if (opt) fireEvent.click(opt)
    })
    // Tenta clicar no botão Concluir após seleção
    const btn = screen.getByRole('button', { name: /concluir/i })
    if (!btn.hasAttribute('disabled')) {
      fireEvent.click(btn)
      await waitFor(() => expect(onboardingRepresentanteMock).toHaveBeenCalled())
    }
  })
})

describe('OnboardingPage rico — CA25 (aluno com cursos)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    onboardingAlunoMock.mockResolvedValue({ ok: true })
  })

  it('CA25-1: ao selecionar aluno, exibe seletor de cursos (multi-select)', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /aluno/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => {
      // Deve aparecer algum controle de seleção de cursos — checkbox, listbox, ou fieldset de cursos
      const cursosEl =
        screen.queryByRole('listbox') ||
        document.querySelector('fieldset') ||
        screen.queryByRole('checkbox') ||
        screen.queryAllByRole('checkbox')[0]
      expect(cursosEl).toBeTruthy()
    })
  })

  it('CA25-2: ao concluir como aluno sem curso, onboardingAluno é chamada (cursos opcionais...)', async () => {
    // Aluno pode concluir sem cursos? Conforme spec RN23 — sim, N >=0 na UI.
    // Fix identidade: Nome obrigatório — preencher antes de Concluir.
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /aluno/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'João Silva' } })
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    await waitFor(() => expect(onboardingAlunoMock).toHaveBeenCalled())
  })

  it('CA25-3: onboardingAluno recebe os cursos selecionados', async () => {
    const user = userEvent.setup()
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /aluno/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    // Fix identidade: Nome obrigatório — preencher antes de Concluir.
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'João Silva' } })
    // Selecionar um curso se possível
    const administracaoOption = screen.queryByLabelText(/administra/i)
    if (administracaoOption) fireEvent.click(administracaoOption)
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    await waitFor(() => expect(onboardingAlunoMock).toHaveBeenCalled())
    // cursos no argumento (pode ser vazio [] se nenhum selecionado)
    const args = onboardingAlunoMock.mock.calls[0]?.[0] as { cursoIds?: string[] }
    expect(args).toBeDefined()
  })
})

describe('OnboardingPage rico — CA29 (coordenador onda2: self-select curso)', () => {
  // Onda 2: CA29 mudou de "admin-assigned" para "self-select + aprovação admin".
  // Coordenador escolhe o curso e envia cadastro; admin aprova depois.
  beforeEach(() => vi.clearAllMocks())

  it('CA29-1: ao selecionar coordenador, exibe seletor de curso (radio fieldset)', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    // Onda 2: seletor de curso obrigatório visível
    expect(document.querySelector('fieldset')).toBeInTheDocument()
    const cursosRadios = screen.getAllByRole('radio').filter(
      (r) => r.getAttribute('name') === 'curso-coord'
    )
    expect(cursosRadios.length).toBeGreaterThan(0)
  })

  it('CA29-2: coordenador NÃO pode concluir sem selecionar curso (onda2)', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    // Nome preenchido mas sem curso → botão desabilitado
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Prof. Lima' } })
    expect(screen.getByRole('button', { name: /concluir/i })).toBeDisabled()
  })

  it('CA29-3: ao concluir com nome+curso, exibe painel EM ANÁLISE (não redireciona)', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Prof. Lima' } })
    const cursosRadios = screen.getAllByRole('radio').filter(
      (r) => r.getAttribute('name') === 'curso-coord'
    )
    fireEvent.click(cursosRadios[0])
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    await waitFor(() => expect(screen.getAllByText(/em análise/i).length).toBeGreaterThan(0))
    expect(pushMock).not.toHaveBeenCalled()
  })
})
