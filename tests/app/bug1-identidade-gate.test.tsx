/**
 * BUG-1 — Após login com Google, onboarding não aparece para usuário sem papel.
 * RED: IdentidadeGate deve redirecionar para /app/onboarding quando o usuário não tem papel.
 * architecture D.7 / RN25 / CA24
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))

// pathnameMock controla o retorno de usePathname — mutável entre testes
let pathnameMock = '/app'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  usePathname: () => pathnameMock,
  useSearchParams: () => ({ get: () => null }),
}))

// Mock getMinhaIdentidade server action
const { getMinhaIdentidadeMock } = vi.hoisted(() => ({
  getMinhaIdentidadeMock: vi.fn(),
}))

vi.mock('@/lib/actions/onboarding', () => ({
  getMinhaIdentidade: (...args: unknown[]) => getMinhaIdentidadeMock(...args),
  onboardingRepresentante: vi.fn().mockResolvedValue({ ok: true }),
  onboardingAluno: vi.fn().mockResolvedValue({ ok: true }),
}))

import { IdentidadeGate } from '@/components/onboarding/IdentidadeGate'

describe('BUG-1 — IdentidadeGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pathnameMock = '/app' // reset para o pathname padrão
  })

  it('redireciona para /app/onboarding quando usuário não tem papel', async () => {
    getMinhaIdentidadeMock.mockResolvedValue({ temPapel: false, papeis: [] })

    render(
      <IdentidadeGate>
        <div data-testid="dashboard">Dashboard</div>
      </IdentidadeGate>,
    )

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app/onboarding')
    })
  })

  it('NÃO redireciona quando usuário já tem papel', async () => {
    getMinhaIdentidadeMock.mockResolvedValue({
      temPapel: true,
      papeis: ['representante'],
    })

    render(
      <IdentidadeGate>
        <div data-testid="dashboard">Dashboard</div>
      </IdentidadeGate>,
    )

    // Aguarda o efeito rodar
    await waitFor(() => expect(getMinhaIdentidadeMock).toHaveBeenCalled())

    expect(replaceMock).not.toHaveBeenCalledWith('/app/onboarding')
    expect(screen.getByTestId('dashboard')).toBeInTheDocument()
  })

  it('renderiza children durante a verificação (não bloqueia a UI)', () => {
    // Promise que nunca resolve — simula verificação em andamento
    getMinhaIdentidadeMock.mockReturnValue(new Promise(() => {}))

    render(
      <IdentidadeGate>
        <div data-testid="content">Conteúdo</div>
      </IdentidadeGate>,
    )

    // Children renderizados imediatamente (não bloqueia)
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })

  it('se pathname === /app/onboarding, não chama getMinhaIdentidade (evita loop)', async () => {
    // Simula que o pathname já é /app/onboarding — o gate não deve verificar nem redirecionar.
    // O mock de usePathname retorna '/app/onboarding' via variável mutável.
    pathnameMock = '/app/onboarding'
    getMinhaIdentidadeMock.mockResolvedValue({ temPapel: false, papeis: [] })

    render(
      <IdentidadeGate>
        <div data-testid="onboarding">Onboarding</div>
      </IdentidadeGate>,
    )

    // Aguarda um tick para o useEffect rodar
    await new Promise((r) => setTimeout(r, 50))

    // NÃO deve chamar getMinhaIdentidade (condição de guarda: já está no onboarding)
    expect(getMinhaIdentidadeMock).not.toHaveBeenCalled()
    // NÃO deve redirecionar
    expect(replaceMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('onboarding')).toBeInTheDocument()
  })
})
