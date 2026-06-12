/**
 * T-O2.7 — T10 /admin/usuarios gestão de papéis/admin
 * RED: falha antes da página existir.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }) }))

const listarUsuariosMock = vi.fn().mockResolvedValue([
  { id: 'u1', email: 'a@ubm.br', papeis: ['aluno'], is_admin: false },
  { id: 'u2', email: 'b@ubm.br', papeis: ['representante'], is_admin: true },
])
const concederPapelMock = vi.fn().mockResolvedValue({ ok: true })
const revogarAdminMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('@/lib/actions/admin-usuarios', () => ({
  listarUsuarios: () => listarUsuariosMock(),
  concederPapel: (...a: unknown[]) => concederPapelMock(...a),
  revogarAdmin: (...a: unknown[]) => revogarAdminMock(...a),
}))

import AdminUsuariosPage from '@/app/admin/usuarios/page'

describe('AdminUsuariosPage — T10', () => {
  it('lista usuários com seus papéis', async () => {
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
    const revogarBtns = screen.getAllByRole('button', { name: /revogar admin/i })
    fireEvent.click(revogarBtns[0])
    // deve mostrar modal de confirmação
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toBeInTheDocument(),
    )
  })
})
