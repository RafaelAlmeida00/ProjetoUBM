import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// usePathname controlável por teste (Header esconde-se em /app|/admin — AppShell já provê a casca)
const { pathRef } = vi.hoisted(() => ({ pathRef: { value: '/' } }))
vi.mock('next/navigation', () => ({ usePathname: () => pathRef.value }))
// ThemeToggle usa contexto de tema; isola-se aqui.
vi.mock('@/components/theme/ThemeToggle', () => ({ ThemeToggle: () => <div data-testid="theme" /> }))
// OAuthButtons é client + modal; stub para inspecionar o `next` que o QuickLogin passa.
vi.mock('@/components/auth/OAuthButtons', () => ({
  OAuthButtons: ({ next }: { next?: string }) => <div data-testid="oauth" data-next={next} />,
}))

import { Header } from '@/components/layout/Header'
import { QuickLogin } from '@/components/auth/QuickLogin'

describe('Header — consciente da sessão (bug: "Entrar" mesmo logado)', () => {
  it('anônimo: mostra "Entrar" (→ /login) e NÃO mostra "Sair"', () => {
    pathRef.value = '/'
    render(<Header user={null} />)
    expect(screen.getByRole('link', { name: /entrar/i })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: /sair/i })).toBeNull()
  })

  it('logado: mostra nome + "Meu painel" (→ /app) + "Sair"; NÃO mostra "Entrar"', () => {
    pathRef.value = '/'
    render(<Header user={{ nome: 'Rafael Almeida' }} />)
    expect(screen.getByText('Rafael Almeida')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /meu painel/i })).toHaveAttribute('href', '/app')
    expect(screen.getByRole('button', { name: /sair/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^entrar$/i })).toBeNull()
  })

  it('em /app: NÃO renderiza o header público (evita header duplicado sobre o AppShell)', () => {
    pathRef.value = '/app'
    const { container } = render(<Header user={{ nome: 'X' }} />)
    expect(container.querySelector('.ubm-header')).toBeNull()
  })
})

describe('QuickLogin — destino pós-login', () => {
  it('envia o usuário para /app após login (não para a rota legada /conta)', () => {
    pathRef.value = '/'
    render(<QuickLogin />)
    expect(screen.getByTestId('oauth')).toHaveAttribute('data-next', '/app')
  })
})
