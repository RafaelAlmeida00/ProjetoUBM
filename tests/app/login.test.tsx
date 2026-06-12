import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}))

import LoginPage from '@/app/login/page'
import { ModalProvider } from '@/components/modal/ModalProvider'

// T3d — AC4/AC5/AC7 (OAuth Google sem campo de e-mail; Microsoft oculto na tela)
describe('app/login', () => {
  it('oferece Google, oculta Microsoft e NÃO tem campo de e-mail (AC5)', () => {
    const { container } = render(
      <ModalProvider>
        <LoginPage />
      </ModalProvider>,
    )
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /microsoft/i })).not.toBeInTheDocument()
    expect(container.querySelector('input[type="email"]')).toBeNull()
  })
})
