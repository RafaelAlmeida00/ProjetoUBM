/**
 * Onda 2 — A3: /admin/usuarios seção "Coordenadores aguardando aprovação"
 * RED: falha até a seção e as actions existirem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ToastProvider } from '@/components/feedback/ToastProvider'

// AdminUsuariosPage migrou o feedback de aprovar/recusar coordenador (inline → snackbar UBM).
// Provider REAL: toast.sucesso('Coordenador aprovado. …') renderiza o texto que o teste assegura.
const renderUI = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

const listarUsuariosMock = vi.fn().mockResolvedValue([
  { id: 'u1', email: 'a@ubm.br', nome: 'Usuário A', papeis: ['aluno'], is_admin: false },
  { id: 'u2', email: 'b@ubm.br', nome: 'Usuário B', papeis: ['representante'], is_admin: true },
])
const revogarAdminMock = vi.fn().mockResolvedValue({ ok: true })
const concederPapelMock = vi.fn().mockResolvedValue({ ok: true })
const listarCoordenadoresPendentesMock = vi.fn().mockResolvedValue([
  {
    id: 'cp1',
    user_id: 'uid-coord1',
    nome: 'Prof. Carla',
    email: 'carla@ubm.br',
    curso_id: 'engenharia_de_software',
    curso_label: 'Engenharia de Software',
    aprovado: false,
  },
])
const aprovarCoordenadorMock = vi.fn().mockResolvedValue({ ok: true })
const recusarCoordenadorMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('@/lib/actions/admin-usuarios', () => ({
  listarUsuarios: () => listarUsuariosMock(),
  concederPapel: (...a: unknown[]) => concederPapelMock(...a),
  revogarAdmin: (...a: unknown[]) => revogarAdminMock(...a),
  // Onda 2 — novas actions
  concederAdmin: () => Promise.resolve({ ok: true }),
  revogarPapel: () => Promise.resolve({ ok: true }),
  concederCoordenador: () => Promise.resolve({ ok: true }),
  adminEditarPerfil: () => Promise.resolve({ ok: true }),
  obterSessaoAdmin: () => Promise.resolve({ userId: 'session-user' }),
  listarCoordenadoresPendentes: () => listarCoordenadoresPendentesMock(),
  aprovarCoordenador: (...a: unknown[]) => aprovarCoordenadorMock(...a),
  recusarCoordenador: (...a: unknown[]) => recusarCoordenadorMock(...a),
}))

import AdminUsuariosPage from '@/app/admin/usuarios/page'

describe('A3 — /admin/usuarios: seção coordenadores pendentes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarUsuariosMock.mockResolvedValue([
      { id: 'u1', email: 'a@ubm.br', nome: 'Usuário A', papeis: ['aluno'], is_admin: false },
      { id: 'u2', email: 'b@ubm.br', nome: 'Usuário B', papeis: ['representante'], is_admin: true },
    ])
    listarCoordenadoresPendentesMock.mockResolvedValue([
      {
        id: 'cp1',
        user_id: 'uid-coord1',
        nome: 'Prof. Carla',
        email: 'carla@ubm.br',
        curso_id: 'engenharia_de_software',
        curso_label: 'Engenharia de Software',
        aprovado: false,
      },
    ])
    aprovarCoordenadorMock.mockResolvedValue({ ok: true })
    recusarCoordenadorMock.mockResolvedValue({ ok: true })
    revogarAdminMock.mockResolvedValue({ ok: true })
  })

  it('exibe seção "APROVAÇÕES PENDENTES" quando há pendências', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => {
      expect(screen.getByText(/aprovações pendentes/i)).toBeInTheDocument()
    })
  })

  it('exibe o nome e email do coordenador pendente', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => {
      expect(screen.getByText('Prof. Carla')).toBeInTheDocument()
      expect(screen.getByText(/carla@ubm.br/i)).toBeInTheDocument()
    })
  })

  it('exibe o curso pedido no chip', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => {
      expect(screen.getByText(/engenharia de software/i)).toBeInTheDocument()
    })
  })

  it('botões Aprovar e Recusar estão presentes para cada pendência', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /aprovar/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /recusar/i })).toBeInTheDocument()
    })
  })

  it('clicar Aprovar abre ConfirmDialog com variant primário', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /aprovar/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/aprovar coordenador/i)).toBeInTheDocument()
    })
  })

  it('clicar Recusar abre ConfirmDialog com texto de recusa', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /recusar/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /recusar/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/recusar cadastro/i)).toBeInTheDocument()
    })
  })

  it('confirmar aprovação chama aprovarCoordenador com userId E cursoId e remove o card otimisticamente', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /aprovar/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // Confirmar no dialog
    const confirmarBtn = screen.getAllByRole('button', { name: /confirmar/i })
    fireEvent.click(confirmarBtn[0])
    await waitFor(() => {
      // contrato correto: (userId, cursoId) — sem cursoId a RPC falha em runtime
      expect(aprovarCoordenadorMock).toHaveBeenCalledWith('uid-coord1', 'engenharia_de_software')
    })
    // Card deve sumir otimisticamente
    await waitFor(() => {
      expect(screen.queryByText('Prof. Carla')).not.toBeInTheDocument()
    })
  })

  it('confirmar recusa chama recusarCoordenador com userId E cursoId e remove o card otimisticamente', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /recusar/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /recusar/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const confirmarBtn = screen.getAllByRole('button', { name: /confirmar/i })
    fireEvent.click(confirmarBtn[0])
    await waitFor(() => {
      // contrato correto: (userId, cursoId)
      expect(recusarCoordenadorMock).toHaveBeenCalledWith('uid-coord1', 'engenharia_de_software')
    })
    await waitFor(() => {
      expect(screen.queryByText('Prof. Carla')).not.toBeInTheDocument()
    })
  })

  it('toast aparece após aprovar', async () => {
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /aprovar/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const confirmarBtn = screen.getAllByRole('button', { name: /confirmar/i })
    fireEvent.click(confirmarBtn[0])
    await waitFor(() => {
      expect(screen.getByText(/coordenador aprovado/i)).toBeInTheDocument()
    })
  })

  it('seção pendências NÃO aparece quando não há pendências', async () => {
    listarCoordenadoresPendentesMock.mockResolvedValue([])
    renderUI(<AdminUsuariosPage />)
    await waitFor(() => {
      expect(screen.queryByText(/aprovações pendentes/i)).not.toBeInTheDocument()
    })
  })
})
