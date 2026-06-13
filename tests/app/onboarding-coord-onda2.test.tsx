/**
 * Onda 2 — A1 + A2: CourseSingleSelect + onboarding coordenador ativo
 * RED: falha até CourseSingleSelect existir e o ramo coordenador ser ativo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => ({ get: (_: string) => null }),
}))

const assumirPapelMock = vi.fn().mockResolvedValue({ ok: true })
const onboardingCoordenadorMock = vi.fn().mockResolvedValue({ ok: true })
const onboardingAlunoMock = vi.fn().mockResolvedValue({ ok: true })
const onboardingRepresentanteMock = vi.fn().mockResolvedValue({ ok: true })
const atualizarPerfilMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('@/lib/actions/assumir-papel', () => ({
  assumirPapel: (...args: unknown[]) => assumirPapelMock(...args),
}))
vi.mock('@/lib/actions/onboarding', () => ({
  onboardingAluno: (...args: unknown[]) => onboardingAlunoMock(...args),
  onboardingRepresentante: (...args: unknown[]) => onboardingRepresentanteMock(...args),
  onboardingCoordenador: (...args: unknown[]) => onboardingCoordenadorMock(...args),
}))
vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([]),
  obterOuCriarEmpresa: vi.fn().mockResolvedValue({ id: 'e1', nome: 'Empresa Teste' }),
}))
vi.mock('@/lib/actions/perfil', () => ({
  atualizarPerfil: (...args: unknown[]) => atualizarPerfilMock(...args),
  getPerfilAction: vi.fn().mockResolvedValue(null),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

import OnboardingPage from '@/app/app/onboarding/page'

describe('A1 — CourseSingleSelect', () => {
  it('CourseSingleSelect existe e renderiza radio inputs', async () => {
    const { CourseSingleSelect } = await import('@/components/course/CourseSingleSelect')
    render(<CourseSingleSelect value={null} onChange={vi.fn()} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBeGreaterThan(0)
  })

  it('exclui a opção nao_sei', async () => {
    const { CourseSingleSelect } = await import('@/components/course/CourseSingleSelect')
    render(<CourseSingleSelect value={null} onChange={vi.fn()} />)
    expect(screen.queryByLabelText(/não sei/i)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('nao_sei')).not.toBeInTheDocument()
  })

  it('chama onChange com o valor selecionado ao clicar em um radio', async () => {
    const { CourseSingleSelect } = await import('@/components/course/CourseSingleSelect')
    const onChangeMock = vi.fn()
    render(<CourseSingleSelect value={null} onChange={onChangeMock} />)
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[0])
    expect(onChangeMock).toHaveBeenCalled()
  })

  it('tem fieldset e legend acessíveis', async () => {
    const { CourseSingleSelect } = await import('@/components/course/CourseSingleSelect')
    render(<CourseSingleSelect value={null} onChange={vi.fn()} />)
    expect(document.querySelector('fieldset')).toBeInTheDocument()
    expect(document.querySelector('legend')).toBeInTheDocument()
  })
})

describe('A2 — Onboarding coordenador ativo (onda 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assumirPapelMock.mockResolvedValue({ ok: true })
    onboardingCoordenadorMock.mockResolvedValue({ ok: true })
    atualizarPerfilMock.mockResolvedValue({ ok: true })
  })

  it('ramo coordenador exibe seletor de curso (radio fieldset)', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => {
      expect(document.querySelector('fieldset')).toBeInTheDocument()
    })
  })

  it('botão Concluir desabilitado quando curso não selecionado', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Prof. Braga' } })
    // Sem curso selecionado, botão deve estar desabilitado
    expect(screen.getByRole('button', { name: /concluir/i })).toBeDisabled()
  })

  it('botão Concluir habilitado quando nome e curso selecionados', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Prof. Braga' } })
    // Selecionar o primeiro radio de curso
    const cursosRadios = screen.getAllByRole('radio').filter(
      (r) => r.getAttribute('name') === 'curso-coord'
    )
    fireEvent.click(cursosRadios[0])
    expect(screen.getByRole('button', { name: /concluir/i })).not.toBeDisabled()
  })

  it('ao concluir chama onboardingCoordenador com cursoId e nome', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Prof. Braga' } })
    const cursosRadios = screen.getAllByRole('radio').filter(
      (r) => r.getAttribute('name') === 'curso-coord'
    )
    fireEvent.click(cursosRadios[0])
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    await waitFor(() => {
      expect(onboardingCoordenadorMock).toHaveBeenCalledWith(
        expect.objectContaining({ cursoId: expect.any(String), nome: 'Prof. Braga' })
      )
    })
  })

  it('estado enviado exibe painel EM ANÁLISE após concluir com sucesso', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Prof. Braga' } })
    const cursosRadios = screen.getAllByRole('radio').filter(
      (r) => r.getAttribute('name') === 'curso-coord'
    )
    fireEvent.click(cursosRadios[0])
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    await waitFor(() => {
      expect(screen.getByText(/em análise/i)).toBeInTheDocument()
    })
    // Não redireciona automaticamente — mostra painel de confirmação
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('estado enviado exibe link "Ir para a plataforma"', async () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Prof. Braga' } })
    const cursosRadios = screen.getAllByRole('radio').filter(
      (r) => r.getAttribute('name') === 'curso-coord'
    )
    fireEvent.click(cursosRadios[0])
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /ir para a plataforma/i })).toBeInTheDocument()
    })
  })

  it('erro no onboardingCoordenador exibe mensagem de erro e mantém form', async () => {
    onboardingCoordenadorMock.mockResolvedValueOnce({ ok: false, error: 'Falha no servidor' })
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Prof. Braga' } })
    const cursosRadios = screen.getAllByRole('radio').filter(
      (r) => r.getAttribute('name') === 'curso-coord'
    )
    fireEvent.click(cursosRadios[0])
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    // Não exibe painel EM ANÁLISE
    expect(screen.queryByText(/em análise/i)).not.toBeInTheDocument()
  })
})
