/**
 * BUG (005) — /admin/usuarios: coordenador com N cursos pendentes.
 * Cenário do cliente: o MESMO usuário se cadastra em 2 cursos → 2 pendências.
 * A RPC listar_coordenadores_pendentes (0054) retorna id = user_id::text para
 * ambas as linhas (id NÃO inclui curso_id). Aprovar UMA não pode derrubar a OUTRA.
 *
 * RED: com o filtro por user_id, aprovar Eng. Civil remove também Eng. de Software
 * da lista (e só reaparece após reload). O fix usa a chave composta (user_id+curso_id).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ToastProvider } from '@/components/feedback/ToastProvider'

// AdminUsuariosPage usa useToast (feedback de moderação de coordenador migrado p/ snackbar UBM).
const renderUI = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

const aprovarCoordenadorMock = vi.fn().mockResolvedValue({ ok: true })
const recusarCoordenadorMock = vi.fn().mockResolvedValue({ ok: true })
// Mesmo user_id e MESMO id (espelha a RPC 0054: id = user_id::text) — só curso difere.
const listarCoordenadoresPendentesMock = vi.fn().mockResolvedValue([
  {
    id: 'uid-said',
    user_id: 'uid-said',
    nome: 'Said',
    email: 'said@ubm.br',
    curso_id: 'engenharia_civil',
    curso_label: 'Engenharia Civil',
    aprovado: false,
  },
  {
    id: 'uid-said',
    user_id: 'uid-said',
    nome: 'Said',
    email: 'said@ubm.br',
    curso_id: 'engenharia_de_software',
    curso_label: 'Engenharia de Software',
    aprovado: false,
  },
])

vi.mock('@/lib/actions/admin-usuarios', () => ({
  listarUsuarios: () => Promise.resolve([]),
  concederPapel: () => Promise.resolve({ ok: true }),
  revogarAdmin: () => Promise.resolve({ ok: true }),
  concederAdmin: () => Promise.resolve({ ok: true }),
  revogarPapel: () => Promise.resolve({ ok: true }),
  concederCoordenador: () => Promise.resolve({ ok: true }),
  concederRepresentante: () => Promise.resolve({ ok: true }),
  adminEditarPerfil: () => Promise.resolve({ ok: true }),
  obterSessaoAdmin: () => Promise.resolve({ userId: 'session-user' }),
  listarCoordenadoresPendentes: () => listarCoordenadoresPendentesMock(),
  aprovarCoordenador: (...a: unknown[]) => aprovarCoordenadorMock(...a),
  recusarCoordenador: (...a: unknown[]) => recusarCoordenadorMock(...a),
}))

import AdminUsuariosPage from '@/app/admin/usuarios/page'

describe('BUG — coordenador multi-curso: aprovar um não derruba os outros', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aprovarCoordenadorMock.mockResolvedValue({ ok: true })
    recusarCoordenadorMock.mockResolvedValue({ ok: true })
    listarCoordenadoresPendentesMock.mockResolvedValue([
      { id: 'uid-said', user_id: 'uid-said', nome: 'Said', email: 'said@ubm.br', curso_id: 'engenharia_civil', curso_label: 'Engenharia Civil', aprovado: false },
      { id: 'uid-said', user_id: 'uid-said', nome: 'Said', email: 'said@ubm.br', curso_id: 'engenharia_de_software', curso_label: 'Engenharia de Software', aprovado: false },
    ])
  })

  it('mostra as DUAS pendências do mesmo usuário (2 pendente(s))', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => {
      expect(screen.getByText(/2 pendente\(s\)/i)).toBeInTheDocument()
      expect(screen.getByText(/CURSO: Engenharia Civil/i)).toBeInTheDocument()
      expect(screen.getByText(/CURSO: Engenharia de Software/i)).toBeInTheDocument()
    })
  })

  it('aprovar Eng. Civil remove SÓ a linha do Civil e mantém a de Software', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByText(/CURSO: Engenharia Civil/i)).toBeInTheDocument())

    // primeira pendência = Eng. Civil (ordem da lista)
    const aprovarBtns = screen.getAllByRole('button', { name: /aprovar/i })
    fireEvent.click(aprovarBtns[0])
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: /confirmar/i })[0])

    // chamou com o curso certo
    await waitFor(() =>
      expect(aprovarCoordenadorMock).toHaveBeenCalledWith('uid-said', 'engenharia_civil'),
    )
    // Civil sai; Software PERMANECE clicável (sem reload)
    await waitFor(() => {
      expect(screen.queryByText(/CURSO: Engenharia Civil/i)).not.toBeInTheDocument()
      expect(screen.getByText(/CURSO: Engenharia de Software/i)).toBeInTheDocument()
    })
  })
})
