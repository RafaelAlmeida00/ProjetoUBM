import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProviders } from '@/components/app/AppProviders'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string | { pathname?: string }; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : (href?.pathname ?? '#')} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} />
  },
}))

import Home from '@/app/page'

const renderHome = () =>
  render(
    <AppProviders>
      <Home />
    </AppProviders>,
  )

// T3b — AC1 (CTA → wizard), RN6 (link → login), prova social, quick-login
describe('Landing', () => {
  it('CTA primário leva ao wizard', () => {
    renderHome()
    expect(screen.getByRole('link', { name: /proponha sua dor/i })).toHaveAttribute('href', '/propor')
  })

  it('oferece entrar (link para /login)', () => {
    renderHome()
    expect(screen.getByRole('link', { name: /entrar/i })).toHaveAttribute('href', '/login')
  })

  it('exibe prova social (Barra Mansa) e quick-login (Google)', () => {
    renderHome()
    expect(screen.getAllByText(/barra mansa/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
  })
})
