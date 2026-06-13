/**
 * T-O2.7 — T10 /admin/usuarios gestão de papéis/admin
 * Testes de regressão base — preservados e atualizados para o contrato Onda 2.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }) }))

const listarUsuariosMock = vi.fn().mockResolvedValue([
  { id: 'u1', email: 'a@ubm.br', nome: 'Usuário A', papeis: ['aluno'], is_admin: true },
  { id: 'u2', email: 'b@ubm.br', nome: 'Usuário B', papeis: ['representante'], is_admin: true },
])
const concederPapelMock = vi.fn().mockResolvedValue({ ok: true })
const revogarAdminMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('@/lib/actions/admin-usuarios', () => ({
  listarUsuarios: () => listarUsuariosMock(),
  concederPapel: (...a: unknown[]) => concederPapelMock(...a),
  revogarAdmin: (...a: unknown[]) => revogarAdminMock(...a),
  // Onda 2 — novas actions (sem pendências neste suite)
  concederAdmin: () => Promise.resolve({ ok: true }),
  revogarPapel: () => Promise.resolve({ ok: true }),
  concederCoordenador: () => Promise.resolve({ ok: true }),
  adminEditarPerfil: () => Promise.resolve({ ok: true }),
  obterSessaoAdmin: () => Promise.resolve({ userId: 'session-user' }),
  listarCoordenadoresPendentes: () => Promise.resolve([]),
  aprovarCoordenador: () => Promise.resolve({ ok: true }),
  recusarCoordenador: () => Promise.resolve({ ok: true }),
}))

import AdminUsuariosPage from '@/app/admin/usuarios/page'

describe('AdminUsuariosPage — T10 (regressão base)', () => {
  it('lista usuários com seus e-mails', async () => {
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByText('a@ubm.br')).toBeInTheDocument())
    expect(screen.getByText('b@ubm.br')).toBeInTheDocument()
  })

  it('admin é indicado visualmente', async () => {
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getAllByText(/admin/i).length).toBeGreaterThan(0))
  })

  it('revogar admin pede confirmação antes de executar', async () => {
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByText('b@ubm.br')).toBeInTheDocument())
    // Abre o painel do usuário B (admin)
    const gerirBtns = screen.getAllByRole('button', { name: /gerir/i })
    // usuário B é admin, está na segunda linha
    fireEvent.click(gerirBtns[1])
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /ações de usuário b/i })).toBeInTheDocument()
    )
    // clica revogar admin
    const revogarBtns = screen.getAllByRole('button', { name: /revogar admin/i })
    fireEvent.click(revogarBtns[0])
    // deve mostrar modal de confirmação
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toBeInTheDocument(),
    )
  })
})
