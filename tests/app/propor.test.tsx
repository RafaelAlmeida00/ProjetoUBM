import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDorLanding: vi.fn(),
  submeterDor: vi.fn(),
  moderarDor: vi.fn(),
}))

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([]),
  obterOuCriarEmpresa: vi.fn(),
}))

import ProporPage from '@/app/propor/page'

// T3c — AC1/AC2 / T-O3.1 (monta o ProporSubmitForm no primeiro passo: e-mail corporativo)
// Atualizado na Onda 3: wizard substituído pelo ProporSubmitForm com submit real (T6).
describe('app/propor', () => {
  it('monta o formulário no primeiro passo (campo de e-mail corporativo)', () => {
    render(<ProporPage />)
    // T6: primeiro passo agora pede e-mail corporativo para verificação (CA23)
    expect(screen.getByPlaceholderText(/voce@suaempresa/i)).toBeInTheDocument()
  })
})
