import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NavRail } from '../../src/components/app/NavRail'

vi.mock('next/navigation', () => ({ usePathname: () => '/app' }))
vi.mock('../../src/lib/supabase/client', () => ({
  temSupabaseNoCliente: () => false,
  createSupabaseBrowserClient: () => ({ auth: { signOut: vi.fn() } }),
}))

describe('NavRail — menu em 2 blocos + Meu Perfil', () => {
  it('expõe /app/conta como "Meu Perfil" (rota antes órfã de menu)', () => {
    render(<NavRail role="representante" isAdmin={false} />)
    const perfil = screen.getByRole('link', { name: /meu perfil/i })
    expect(perfil).toHaveAttribute('href', '/app/conta')
  })

  it('tem o item "Sair" no bloco de perfil', () => {
    render(<NavRail role="representante" isAdmin={false} />)
    expect(screen.getByRole('button', { name: /sair/i })).toBeInTheDocument()
  })

  it('o bloco de perfil usa empilhamento inverso (column-reverse)', () => {
    const { container } = render(<NavRail role="representante" isAdmin={false} />)
    expect(container.querySelector('.ubm-navrail-perfil')).not.toBeNull()
    expect(container.querySelector('.ubm-navrail-bottom')).not.toBeNull()
  })

  it('mantém a navegação principal (Dores) no bloco do topo', () => {
    render(<NavRail role="representante" isAdmin={false} />)
    expect(screen.getByRole('link', { name: /dores/i })).toHaveAttribute('href', '/app/dores')
  })
})
