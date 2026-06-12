/**
 * T-B15 (complemento) — validação de e-mail gratuito no onboarding representante
 * Spec: ux-ui report §6 (dominios gratuitos → erro contextual; role="alert"; aria-invalid)
 *
 * RED: falha antes do código de validação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from 'react'

// ── Mocks necessários para o onboarding page ─────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => ({ get: vi.fn(() => null) })),
}))

vi.mock('@/lib/actions/onboarding', () => ({
  onboardingRepresentante: vi.fn().mockResolvedValue({ ok: true }),
  onboardingAluno: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/assumir-papel', () => ({
  assumirPapel: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/perfil', () => ({
  atualizarPerfil: vi.fn().mockResolvedValue({ ok: true }),
  getPerfilAction: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/components/onboarding/CacheSkipGate', () => ({
  CacheSkipGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/empresa/EmpresaCombobox', () => ({
  EmpresaCombobox: ({ onChange, label }: { onChange: (v: unknown) => void; label: string }) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => onChange({ id: 'emp-1', nome: 'Empresa Teste' })}
    >
      {label}
    </button>
  ),
}))

vi.mock('@/components/course/CourseMultiSelect', () => ({
  CourseMultiSelect: () => <div data-testid="course-select" />,
}))

vi.mock('@/lib/courses', () => ({ CURSOS_UBM: [] }))
vi.mock('@/components/brand/Node', () => ({ Node: () => <svg /> }))

import OnboardingPage from '@/app/app/onboarding/page'

// Helper: avança para etapa "infos" como representante
async function renderOnboardingRepresentante() {
  const utils = render(<OnboardingPage />)
  // Seleciona "Representante"
  const repRadio = utils.container.querySelector('input[value="representante"]') as HTMLInputElement
  if (!repRadio) throw new Error('Radio representante não encontrado')
  await act(async () => { fireEvent.click(repRadio) })
  // Clica Continuar
  const continuar = screen.getByRole('button', { name: /continuar/i })
  await act(async () => { fireEvent.click(continuar) })
  return utils
}

describe('B15-8 — helper do e-mail corporativo (spec §6 — reciprocidade/transparência)', () => {
  it('B15-8a: helper explica o POR QUÊ: contato quando dor aprovada/publicada/interesse', async () => {
    await renderOnboardingRepresentante()
    const helper = screen.queryByText(/UBM fala com a sua empresa/i)
      ?? screen.queryByText(/quando uma dor.*aprovada/i)
    expect(helper, 'helper deve explicar o por quê do campo (contato/notificações)').toBeTruthy()
  })

  it('B15-8b: placeholder é "voce@suaempresa.com.br" (não o antigo "voce@empresa.com")', async () => {
    await renderOnboardingRepresentante()
    const input = screen.getByRole('textbox', { name: /e-mail corporativo/i }) as HTMLInputElement
    expect(input.placeholder).toContain('suaempresa.com.br')
  })
})

describe('B15-9 — validação de domínio gratuito (spec §6)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('B15-9a: e-mail @gmail.com dispara mensagem de erro específica com "domínio da sua empresa"', async () => {
    const { container } = await renderOnboardingRepresentante()
    const input = screen.getByRole('textbox', { name: /e-mail corporativo/i })

    await act(async () => {
      fireEvent.change(input, { target: { value: 'ana@gmail.com' } })
      fireEvent.blur(input)
    })

    // Deve ter role="alert" com mensagem sobre domínio
    const alert = container.querySelector('[role="alert"]')
    expect(alert, 'deve exibir role=alert após blur com @gmail.com').toBeTruthy()
    expect(alert!.textContent).toMatch(/dom[ií]nio da sua empresa/i)
  })

  it('B15-9b: input fica aria-invalid=true após blur com e-mail gratuito', async () => {
    await renderOnboardingRepresentante()
    const input = screen.getByRole('textbox', { name: /e-mail corporativo/i }) as HTMLInputElement

    await act(async () => {
      fireEvent.change(input, { target: { value: 'ana@hotmail.com' } })
      fireEvent.blur(input)
    })

    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('B15-9c: e-mail corporativo válido não dispara erro', async () => {
    const { container } = await renderOnboardingRepresentante()
    const input = screen.getByRole('textbox', { name: /e-mail corporativo/i })

    await act(async () => {
      fireEvent.change(input, { target: { value: 'ana@empresa.com.br' } })
      fireEvent.blur(input)
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).toBeFalsy()
  })

  it('B15-9d: "Concluir" permanece desabilitado enquanto e-mail é de domínio gratuito', async () => {
    await renderOnboardingRepresentante()
    const input = screen.getByRole('textbox', { name: /e-mail corporativo/i })
    // Seleciona empresa
    const empresaBtn = screen.getByRole('button', { name: /empresa \*/i })
    await act(async () => { fireEvent.click(empresaBtn) })

    await act(async () => {
      fireEvent.change(input, { target: { value: 'joao@outlook.com' } })
      fireEvent.blur(input)
    })

    const concluir = screen.getByRole('button', { name: /concluir/i })
    expect(concluir).toBeDisabled()
  })

  it('B15-9e: e-mail @yahoo.com.br também é rejeitado (domínio gratuito BR)', async () => {
    const { container } = await renderOnboardingRepresentante()
    const input = screen.getByRole('textbox', { name: /e-mail corporativo/i })

    await act(async () => {
      fireEvent.change(input, { target: { value: 'silva@yahoo.com.br' } })
      fireEvent.blur(input)
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).toBeTruthy()
  })

  it('B15-9f: e-mail malformado (sem @) dispara erro de formato', async () => {
    const { container } = await renderOnboardingRepresentante()
    const input = screen.getByRole('textbox', { name: /e-mail corporativo/i })

    await act(async () => {
      fireEvent.change(input, { target: { value: 'emailsemarroba' } })
      fireEvent.blur(input)
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert, 'deve exibir erro para e-mail malformado').toBeTruthy()
    expect(alert!.textContent).toMatch(/@|dom[ií]nio|formato/i)
  })
})
