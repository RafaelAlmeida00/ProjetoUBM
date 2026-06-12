import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}))

import ContaPage from '@/app/conta/page'

// T3f — AC7/RS1 (fail-closed: sem sessão → /login)
describe('app/conta', () => {
  it('sem sessão, redireciona para /login', async () => {
    render(<ContaPage />)
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'))
  })
})
