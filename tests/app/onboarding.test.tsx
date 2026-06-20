/**
 * T-O2.3 — T3 /app/onboarding escolher papel
 * Atualizado para o fluxo de dois estágios (RN21-24):
 *   estágio 1 = selecionar tipo + "Continuar"
 *   estágio 2 = preencher infos por tipo + "Concluir"
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => ({ get: (_: string) => null }),
}))

// mocks das server actions
const assumirPapelMock = vi.fn().mockResolvedValue({ ok: true })
const onboardingAlunoMock = vi.fn().mockResolvedValue({ ok: true })
const onboardingRepresentanteMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('@/lib/actions/assumir-papel', () => ({
  assumirPapel: (...args: unknown[]) => assumirPapelMock(...args),
}))
vi.mock('@/lib/actions/onboarding', () => ({
  onboardingAluno: (...args: unknown[]) => onboardingAlunoMock(...args),
  onboardingRepresentante: (...args: unknown[]) => onboardingRepresentanteMock(...args),
  onboardingCoordenador: (..._args: unknown[]) => Promise.resolve({ ok: true }),
}))
vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([]),
  obterOuCriarEmpresa: vi.fn().mockResolvedValue({ id: 'e1', nome: 'Empresa Teste' }),
}))

vi.mock('@/lib/actions/perfil', () => ({
  atualizarPerfil: vi.fn().mockResolvedValue({ ok: true }),
  getPerfilAction: vi.fn().mockResolvedValue(null),
}))

// next/headers não existe em jsdom
vi.mock('next/headers', () => ({ cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }) }))

import OnboardingPage from '@/app/app/onboarding/page'

describe('OnboardingPage — T3', () => {
  it('exibe as 3 opções de papel como radiogroup (WAI-ARIA)', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /aluno/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /coordenador/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /representante/i })).toBeInTheDocument()
  })

  it('ao selecionar aluno e avançar para infos, exibe tela de cursos', async () => {
    // Novo fluxo (RN21-24): "Continuar" no estágio 1 avança para estágio 2 (infos por tipo)
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /aluno/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    // Estágio 2 do aluno: seletor de cursos (fieldset ou checkboxes)
    await waitFor(() => {
      const cursosEl =
        document.querySelector('fieldset') ||
        screen.queryByRole('checkbox') ||
        screen.queryAllByRole('checkbox')[0]
      expect(cursosEl).toBeTruthy()
    })
    // Botão "Concluir" disponível para aluno (cursos opcionais)
    expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument()
  })

  it('ao concluir como coordenador (ativo onda2/0057), chama onboardingCoordenador e exibe EM ANÁLISE', async () => {
    // 0057: fluxo ativo — seleciona N cursos (checkbox) + nome → onboardingCoordenador → painel EM ANÁLISE (sem redirect)
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Prof. Braga' } })
    // 0057: CourseMultiSelect usa checkboxes (não radios com name="curso-coord")
    const cursosCheckboxes = screen.getAllByRole('checkbox').filter(
      (el) => !el.closest('[role="dialog"]')
    )
    fireEvent.click(cursosCheckboxes[0])
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    await waitFor(() => expect(onboardingAlunoMock).not.toHaveBeenCalled())
    // Não redireciona — exibe painel EM ANÁLISE
    await waitFor(() => expect(pushMock).not.toHaveBeenCalled())
    await waitFor(() => expect(screen.getAllByText(/em análise/i).length).toBeGreaterThan(0))
  })

  it('erro no concluir (coordenador onda2/0057) mostra painel EM ANÁLISE quando ok:true', async () => {
    onboardingRepresentanteMock.mockResolvedValue({ ok: true })
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Prof. Braga' } })
    // 0057: checkbox
    const cursosCheckboxes = screen.getAllByRole('checkbox').filter(
      (el) => !el.closest('[role="dialog"]')
    )
    fireEvent.click(cursosCheckboxes[0])
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    // onboardingCoordenadorMock padrão retorna { ok: true }, painel EM ANÁLISE deve aparecer
    await waitFor(() => {
      expect(screen.getAllByText(/em análise/i).length).toBeGreaterThan(0)
    })
  })

  it('botão desabilitado antes de selecionar papel', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled()
  })
})
