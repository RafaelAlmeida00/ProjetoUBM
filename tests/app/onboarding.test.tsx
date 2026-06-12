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
}))
vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([]),
  obterOuCriarEmpresa: vi.fn().mockResolvedValue({ id: 'e1', nome: 'Empresa Teste' }),
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

  it('ao concluir como coordenador (passivo), chama assumirPapel e redireciona', async () => {
    // Novo fluxo: estágio 1 → Continuar → estágio 2 (tela passiva) → Concluir
    assumirPapelMock.mockResolvedValueOnce({ ok: true })
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    await waitFor(() => expect(assumirPapelMock).toHaveBeenCalledWith('coordenador'))
    await waitFor(() => expect(pushMock).toHaveBeenCalled())
  })

  it('erro no concluir (coordenador) mostra mensagem PT-BR e mantém tela', async () => {
    // Erro é exibido na tela de "Concluir" (estágio 2), não no "Continuar" (estágio 1)
    assumirPapelMock.mockResolvedValueOnce({ ok: false, error: 'Erro ao definir papel' })
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coordenador/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /concluir/i }))
    // Deve mostrar mensagem de erro genérica (mapeada pelo mapError da action)
    await waitFor(() => {
      const erroEl =
        screen.queryByText(/não conseguimos/i) ||
        screen.queryByText(/não foi possível/i) ||
        screen.queryByRole('alert')
      expect(erroEl).toBeInTheDocument()
    })
  })

  it('botão desabilitado antes de selecionar papel', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled()
  })
})
