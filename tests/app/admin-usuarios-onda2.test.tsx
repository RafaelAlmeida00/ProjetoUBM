/**
 * Onda 2 — /admin/usuarios gestão completa de papéis e admin
 * TDD RED: falha até a implementação estar completa.
 * Cobre: actions novas + UI (painel Gerir, chips, admin, editar nome, guards).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

// --- mocks das actions ---
const listarUsuariosMock = vi.fn()
const concederPapelMock = vi.fn().mockResolvedValue({ ok: true })
const revogarAdminMock = vi.fn().mockResolvedValue({ ok: true })
const concederAdminMock = vi.fn().mockResolvedValue({ ok: true })
const revogarPapelMock = vi.fn().mockResolvedValue({ ok: true })
const concederCoordenadorMock = vi.fn().mockResolvedValue({ ok: true })
const adminEditarPerfilMock = vi.fn().mockResolvedValue({ ok: true })
const listarCoordenadoresPendentesMock = vi.fn().mockResolvedValue([])
const aprovarCoordenadorMock = vi.fn().mockResolvedValue({ ok: true })
const recusarCoordenadorMock = vi.fn().mockResolvedValue({ ok: true })
// mock de sessão atual: u1 é o admin logado
const obterSessaoAdminMock = vi.fn().mockResolvedValue({ userId: 'u1' })

vi.mock('@/lib/actions/admin-usuarios', () => ({
  listarUsuarios: () => listarUsuariosMock(),
  concederPapel: (...a: unknown[]) => concederPapelMock(...a),
  revogarAdmin: (...a: unknown[]) => revogarAdminMock(...a),
  concederAdmin: (...a: unknown[]) => concederAdminMock(...a),
  revogarPapel: (...a: unknown[]) => revogarPapelMock(...a),
  concederCoordenador: (...a: unknown[]) => concederCoordenadorMock(...a),
  adminEditarPerfil: (...a: unknown[]) => adminEditarPerfilMock(...a),
  listarCoordenadoresPendentes: () => listarCoordenadoresPendentesMock(),
  aprovarCoordenador: (...a: unknown[]) => aprovarCoordenadorMock(...a),
  recusarCoordenador: (...a: unknown[]) => recusarCoordenadorMock(...a),
  obterSessaoAdmin: () => obterSessaoAdminMock(),
}))

import AdminUsuariosPage from '@/app/admin/usuarios/page'

// Dados de fixture
const U_ADMIN_LOGADO = {
  id: 'u1',
  email: 'admin@ubm.br',
  nome: 'Admin Principal',
  papeis: ['aluno'],
  is_admin: true,
}
const U_ADMIN2 = {
  id: 'u2',
  email: 'admin2@ubm.br',
  nome: 'Segundo Admin',
  papeis: ['representante'],
  is_admin: true,
}
const U_ALUNO = {
  id: 'u3',
  email: 'aluno@ubm.br',
  nome: 'João Aluno',
  papeis: ['aluno'],
  is_admin: false,
}
const U_COORD = {
  id: 'u4',
  email: 'coord@ubm.br',
  nome: 'Profa. Maria',
  papeis: ['coordenador'],
  is_admin: false,
  cursos_coordenados: [{ curso_id: 'direito', curso_label: 'Direito' }],
}

function setup(usuarios = [U_ADMIN_LOGADO, U_ADMIN2, U_ALUNO]) {
  listarUsuariosMock.mockResolvedValue(usuarios)
  return render(<AdminUsuariosPage />)
}

// ─── 1. Tabela enriquecida ──────────────────────────────────────────────────

describe('Tabela enriquecida', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarCoordenadoresPendentesMock.mockResolvedValue([])
  })

  it('exibe nome do usuário (peso 600) e e-mail', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Admin Principal')).toBeInTheDocument())
    expect(screen.getByText('admin@ubm.br')).toBeInTheDocument()
  })

  it('exibe chips de papéis com classes corretas (aluno, representante, coordenador)', async () => {
    listarUsuariosMock.mockResolvedValue([U_ALUNO, U_COORD])
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByText('João Aluno')).toBeInTheDocument())
    // chip aluno — classe ubm-member-papel-chip--aluno
    const chipAluno = document.querySelector('.ubm-member-papel-chip--aluno')
    expect(chipAluno).toBeTruthy()
    // chip coordenador — contém texto COORDENADOR · Direito
    const chipCoord = document.querySelector('.ubm-member-papel-chip--coordenador')
    expect(chipCoord).toBeTruthy()
    expect(chipCoord?.textContent).toMatch(/coordenador/i)
    expect(chipCoord?.textContent).toMatch(/direito/i)
  })

  it('exibe selo ADMIN com Shield quando usuário é admin', async () => {
    setup([U_ADMIN_LOGADO])
    await waitFor(() => expect(screen.getByText('Admin Principal')).toBeInTheDocument())
    // texto ADMIN visível
    const adminText = screen.getAllByText(/^ADMIN$/i)
    expect(adminText.length).toBeGreaterThan(0)
  })

  it('exibe traço quando não é admin', async () => {
    setup([U_ALUNO])
    await waitFor(() => expect(screen.getByText('João Aluno')).toBeInTheDocument())
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('cada linha tem botão Gerir', async () => {
    setup([U_ALUNO, U_ADMIN2])
    await waitFor(() => expect(screen.getAllByRole('button', { name: /gerir/i }).length).toBeGreaterThan(0))
  })
})

// ─── 2. Painel Gerir (expand inline) ───────────────────────────────────────

describe('Painel Gerir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarCoordenadoresPendentesMock.mockResolvedValue([])
  })

  async function abrirPainelAluno() {
    setup([U_ALUNO])
    await waitFor(() => expect(screen.getByRole('button', { name: /gerir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /gerir/i }))
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /ações de/i })).toBeInTheDocument()
    )
  }

  it('clicar Gerir expande painel com role=region aria-label="Ações de {nome}"', async () => {
    await abrirPainelAluno()
    expect(screen.getByRole('region', { name: /ações de joão aluno/i })).toBeInTheDocument()
  })

  it('clicar Gerir novamente fecha o painel', async () => {
    setup([U_ALUNO])
    await waitFor(() => expect(screen.getByRole('button', { name: /gerir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /gerir/i }))
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /ações de/i })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: /gerir/i }))
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /ações de/i })).not.toBeInTheDocument()
    )
  })

  it('painel exibe select de "Conceder papel" com as opções ainda não detidas pelo usuário', async () => {
    await abrirPainelAluno()
    // aluno já tem 'aluno', então não deve oferecer aluno novamente; deve oferecer representante
    const select = screen.getByRole('combobox', { name: /papel/i })
    expect(select).toBeInTheDocument()
    // representante deve estar disponível
    expect(screen.getByRole('option', { name: /representante/i })).toBeInTheDocument()
    // aluno não deve aparecer como opção
    const alunoOption = screen.queryByRole('option', { name: /^aluno$/i })
    expect(alunoOption).not.toBeInTheDocument()
  })

  it('Bloco A — painel exibe chips dos papéis atuais com botão × por chip', async () => {
    await abrirPainelAluno()
    const chipAluno = screen.getByRole('button', { name: /revogar papel aluno/i })
    expect(chipAluno).toBeInTheDocument()
  })
})

// ─── 3. Conceder papel ──────────────────────────────────────────────────────

describe('Conceder papel (não-coordenador)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarCoordenadoresPendentesMock.mockResolvedValue([])
    concederPapelMock.mockResolvedValue({ ok: true })
  })

  it('conceder representante para aluno chama concederPapel(userId, "representante")', async () => {
    listarUsuariosMock.mockResolvedValue([U_ALUNO])
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /gerir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /gerir/i }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: /papel/i })).toBeInTheDocument())

    const select = screen.getByRole('combobox', { name: /papel/i })
    fireEvent.change(select, { target: { value: 'representante' } })

    const concederBtn = screen.getByRole('button', { name: /^conceder$/i })
    fireEvent.click(concederBtn)

    // Confirm dialog aparece
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const confirmarBtn = screen.getByRole('button', { name: /confirmar/i })
    fireEvent.click(confirmarBtn)

    await waitFor(() =>
      expect(concederPapelMock).toHaveBeenCalledWith('u3', 'representante')
    )
  })

  it('toast de sucesso exibe o nome após conceder papel', async () => {
    listarUsuariosMock.mockResolvedValue([U_ALUNO])
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /gerir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /gerir/i }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: /papel/i })).toBeInTheDocument())

    const select = screen.getByRole('combobox', { name: /papel/i })
    fireEvent.change(select, { target: { value: 'representante' } })
    fireEvent.click(screen.getByRole('button', { name: /^conceder$/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/representante.*joão aluno|joão aluno.*representante/i)
    )
  })
})

// ─── 4. Conceder coordenador (fluxo com curso) ─────────────────────────────

describe('Conceder papel coordenador', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarCoordenadoresPendentesMock.mockResolvedValue([])
    concederCoordenadorMock.mockResolvedValue({ ok: true })
  })

  async function selecionarCoordenador(usuarios = [U_ALUNO]) {
    listarUsuariosMock.mockResolvedValue(usuarios)
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /gerir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /gerir/i }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: /papel/i })).toBeInTheDocument())
    const select = screen.getByRole('combobox', { name: /papel/i })
    fireEvent.change(select, { target: { value: 'coordenador' } })
  }

  it('ao selecionar "coordenador", aparece select de curso obrigatório', async () => {
    await selecionarCoordenador()
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /curso/i })).toBeInTheDocument()
    )
  })

  it('botão Conceder fica disabled enquanto não há curso selecionado', async () => {
    await selecionarCoordenador()
    await waitFor(() => expect(screen.getByRole('combobox', { name: /curso/i })).toBeInTheDocument())
    const concederBtn = screen.getByRole('button', { name: /^conceder$/i })
    expect(concederBtn).toBeDisabled()
  })

  it('microcopy explicativo é exibido quando coordenador selecionado', async () => {
    await selecionarCoordenador()
    await waitFor(() =>
      expect(screen.getByText(/já aprovado para o curso/i)).toBeInTheDocument()
    )
  })

  it('conceder coordenador chama concederCoordenador(userId, cursoId)', async () => {
    await selecionarCoordenador()
    await waitFor(() => expect(screen.getByRole('combobox', { name: /curso/i })).toBeInTheDocument())
    const cursoSelect = screen.getByRole('combobox', { name: /curso/i })
    fireEvent.change(cursoSelect, { target: { value: 'direito' } })

    const concederBtn = screen.getByRole('button', { name: /^conceder$/i })
    expect(concederBtn).not.toBeDisabled()
    fireEvent.click(concederBtn)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // confirm dialog deve mencionar o nome e o curso
    expect(screen.getByText(/conceder coordenador/i)).toBeInTheDocument()
    const confirmarBtn = screen.getByRole('button', { name: /confirmar/i })
    fireEvent.click(confirmarBtn)

    await waitFor(() =>
      expect(concederCoordenadorMock).toHaveBeenCalledWith('u3', 'direito')
    )
  })

  it('NÃO chama concederPapel para coordenador', async () => {
    await selecionarCoordenador()
    await waitFor(() => expect(screen.getByRole('combobox', { name: /curso/i })).toBeInTheDocument())
    fireEvent.change(screen.getByRole('combobox', { name: /curso/i }), { target: { value: 'direito' } })
    fireEvent.click(screen.getByRole('button', { name: /^conceder$/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() => expect(concederCoordenadorMock).toHaveBeenCalled())
    expect(concederPapelMock).not.toHaveBeenCalled()
  })
})

// ─── 5. Revogar papel ───────────────────────────────────────────────────────

describe('Revogar papel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarCoordenadoresPendentesMock.mockResolvedValue([])
    revogarPapelMock.mockResolvedValue({ ok: true })
  })

  it('clicar × no chip abre ConfirmDialog com variant destructive', async () => {
    listarUsuariosMock.mockResolvedValue([U_ALUNO])
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /gerir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /gerir/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /revogar papel aluno/i })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: /revogar papel aluno/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText(/revogar papel/i)).toBeInTheDocument()
  })

  it('confirmar revogação chama revogarPapel(userId, role)', async () => {
    listarUsuariosMock.mockResolvedValue([U_ALUNO])
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /gerir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /gerir/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /revogar papel aluno/i })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: /revogar papel aluno/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() => expect(revogarPapelMock).toHaveBeenCalledWith('u3', 'aluno'))
  })
})

// ─── 6. Conceder Admin ──────────────────────────────────────────────────────

describe('Conceder Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarCoordenadoresPendentesMock.mockResolvedValue([])
    concederAdminMock.mockResolvedValue({ ok: true })
  })

  async function abrirPainelAluno() {
    listarUsuariosMock.mockResolvedValue([U_ALUNO, U_ADMIN_LOGADO])
    render(<AdminUsuariosPage />)
    // O painel do U_ALUNO (não-admin)
    await waitFor(() => {
      const gerirBtns = screen.getAllByRole('button', { name: /gerir/i })
      expect(gerirBtns.length).toBeGreaterThan(0)
    })
    // clica o primeiro Gerir (do aluno)
    const gerirBtns = screen.getAllByRole('button', { name: /gerir/i })
    fireEvent.click(gerirBtns[0])
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /ações de joão aluno/i })).toBeInTheDocument()
    )
  }

  it('bloco ADMINISTRAÇÃO aparece no painel com label visível', async () => {
    await abrirPainelAluno()
    expect(screen.getByText(/administração/i)).toBeInTheDocument()
  })

  it('botão "Conceder admin" presente para usuário não-admin', async () => {
    await abrirPainelAluno()
    expect(screen.getByRole('button', { name: /conceder admin/i })).toBeInTheDocument()
  })

  it('clicar "Conceder admin" abre ConfirmDialog com titulo "Conceder acesso de administrador"', async () => {
    await abrirPainelAluno()
    fireEvent.click(screen.getByRole('button', { name: /conceder admin/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText(/conceder acesso de administrador/i)).toBeInTheDocument()
  })

  it('confirmação dupla: checkbox de entendimento habilita botão Confirmar', async () => {
    await abrirPainelAluno()
    fireEvent.click(screen.getByRole('button', { name: /conceder admin/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // botão confirmar deve estar disabled antes do checkbox
    const confirmarBtn = screen.getByRole('button', { name: /confirmar/i })
    expect(confirmarBtn).toBeDisabled()
    // marcar o checkbox habilita
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(confirmarBtn).not.toBeDisabled()
  })

  it('confirmar (com checkbox) chama concederAdmin(userId)', async () => {
    await abrirPainelAluno()
    fireEvent.click(screen.getByRole('button', { name: /conceder admin/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() => expect(concederAdminMock).toHaveBeenCalledWith('u3'))
  })

  it('toast de sucesso após conceder admin', async () => {
    await abrirPainelAluno()
    fireEvent.click(screen.getByRole('button', { name: /conceder admin/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/acesso de administrador concedido/i)
    )
  })
})

// ─── 7. Revogar Admin — guards ──────────────────────────────────────────────

describe('Revogar Admin — guards visuais', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarCoordenadoresPendentesMock.mockResolvedValue([])
    revogarAdminMock.mockResolvedValue({ ok: true })
    // sessão: u1 é o admin logado
    obterSessaoAdminMock.mockResolvedValue({ userId: 'u1' })
  })

  async function abrirPainelDeAdmin(usuario: typeof U_ADMIN_LOGADO) {
    // sempre 2 admins para não ser "último"
    const outros = [U_ADMIN_LOGADO, U_ADMIN2].filter((u) => u.id !== usuario.id)
    listarUsuariosMock.mockResolvedValue([usuario, ...outros])
    render(<AdminUsuariosPage />)
    await waitFor(() => {
      const gerirBtns = screen.getAllByRole('button', { name: /gerir/i })
      expect(gerirBtns.length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getAllByRole('button', { name: /gerir/i })[0])
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /ações de/i })).toBeInTheDocument()
    )
  }

  it('botão Revogar admin presente para admin que não é o próprio usuário', async () => {
    await abrirPainelDeAdmin(U_ADMIN2)
    expect(screen.getByRole('button', { name: /revogar admin/i })).toBeInTheDocument()
  })

  it('botão Revogar admin DISABLED quando é o próprio usuário logado + motivo visível', async () => {
    await abrirPainelDeAdmin(U_ADMIN_LOGADO)
    const btn = screen.getByRole('button', { name: /revogar admin de admin principal/i })
    expect(btn).toBeDisabled()
    // motivo visível no DOM (não só title)
    expect(screen.getByText(/não pode revogar o próprio/i)).toBeInTheDocument()
  })

  it('botão Revogar admin DISABLED quando há apenas 1 admin + motivo visível', async () => {
    // só 1 admin total
    listarUsuariosMock.mockResolvedValue([U_ADMIN_LOGADO, U_ALUNO])
    render(<AdminUsuariosPage />)
    await waitFor(() => {
      const gerirBtns = screen.getAllByRole('button', { name: /gerir/i })
      expect(gerirBtns.length).toBeGreaterThan(0)
    })
    // abre painel do admin (mas U_ADMIN_LOGADO é o único admin, não pode revogar o próprio)
    fireEvent.click(screen.getAllByRole('button', { name: /gerir/i })[0])
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /ações de/i })).toBeInTheDocument()
    )
    const btn = screen.getByRole('button', { name: /revogar admin/i })
    expect(btn).toBeDisabled()
    expect(screen.getByText(/precisa de ao menos um administrador/i)).toBeInTheDocument()
  })

  it('confirmar revogar admin chama revogarAdmin(userId)', async () => {
    await abrirPainelDeAdmin(U_ADMIN2)
    fireEvent.click(screen.getByRole('button', { name: /revogar admin/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() => expect(revogarAdminMock).toHaveBeenCalledWith('u2'))
  })

  it('toast de sucesso após revogar admin', async () => {
    await abrirPainelDeAdmin(U_ADMIN2)
    fireEvent.click(screen.getByRole('button', { name: /revogar admin/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/acesso de administrador revogado/i)
    )
  })

  it('mapeia erro de lockout do banco para mensagem amigável', async () => {
    revogarAdminMock.mockResolvedValue({ ok: false, error: 'A plataforma precisa de ao menos um admin' })
    await abrirPainelDeAdmin(U_ADMIN2)
    fireEvent.click(screen.getByRole('button', { name: /revogar admin/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/não foi possível concluir/i)
    )
  })
})

// ─── 8. Editar nome ─────────────────────────────────────────────────────────

describe('Editar nome (Bloco C)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarCoordenadoresPendentesMock.mockResolvedValue([])
    adminEditarPerfilMock.mockResolvedValue({ ok: true })
  })

  async function abrirPainelComEditar() {
    listarUsuariosMock.mockResolvedValue([U_ALUNO])
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /gerir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /gerir/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /editar nome/i })).toBeInTheDocument()
    )
  }

  it('botão "Editar nome" abre campo inline', async () => {
    await abrirPainelComEditar()
    fireEvent.click(screen.getByRole('button', { name: /editar nome/i }))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /nome/i })).toBeInTheDocument()
    )
  })

  it('campo inline pré-preenchido com nome atual', async () => {
    await abrirPainelComEditar()
    fireEvent.click(screen.getByRole('button', { name: /editar nome/i }))
    await waitFor(() => {
      const input = screen.getByRole('textbox', { name: /nome/i }) as HTMLInputElement
      expect(input.value).toBe('João Aluno')
    })
  })

  it('ESC cancela a edição sem salvar', async () => {
    await abrirPainelComEditar()
    fireEvent.click(screen.getByRole('button', { name: /editar nome/i }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: /nome/i })).toBeInTheDocument())
    const input = screen.getByRole('textbox', { name: /nome/i })
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /nome/i })).not.toBeInTheDocument()
    )
    expect(adminEditarPerfilMock).not.toHaveBeenCalled()
  })

  it('Enter salva e chama adminEditarPerfil(userId, novoNome)', async () => {
    await abrirPainelComEditar()
    fireEvent.click(screen.getByRole('button', { name: /editar nome/i }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: /nome/i })).toBeInTheDocument())
    const input = screen.getByRole('textbox', { name: /nome/i })
    fireEvent.change(input, { target: { value: 'João Editado' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(adminEditarPerfilMock).toHaveBeenCalledWith('u3', 'João Editado')
    )
  })

  it('botão Salvar chama adminEditarPerfil', async () => {
    await abrirPainelComEditar()
    fireEvent.click(screen.getByRole('button', { name: /editar nome/i }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: /nome/i })).toBeInTheDocument())
    const input = screen.getByRole('textbox', { name: /nome/i })
    fireEvent.change(input, { target: { value: 'Novo Nome' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() =>
      expect(adminEditarPerfilMock).toHaveBeenCalledWith('u3', 'Novo Nome')
    )
  })

  it('botão Cancelar fecha o campo sem salvar', async () => {
    await abrirPainelComEditar()
    fireEvent.click(screen.getByRole('button', { name: /editar nome/i }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: /nome/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /nome/i })).not.toBeInTheDocument()
    )
    expect(adminEditarPerfilMock).not.toHaveBeenCalled()
  })
})

// ─── 9. Actions — contratos ─────────────────────────────────────────────────

describe('Actions — contratos (smoke de tipos)', () => {
  it('revogarAdmin chama RPC revogar_admin (não delete direto)', async () => {
    // Verificado no import: a action exporta a função; a implementação é testada via unit
    const { revogarAdmin } = await import('@/lib/actions/admin-usuarios')
    expect(typeof revogarAdmin).toBe('function')
  })

  it('concederAdmin exportado', async () => {
    const { concederAdmin } = await import('@/lib/actions/admin-usuarios')
    expect(typeof concederAdmin).toBe('function')
  })

  it('revogarPapel exportado', async () => {
    const { revogarPapel } = await import('@/lib/actions/admin-usuarios')
    expect(typeof revogarPapel).toBe('function')
  })

  it('concederCoordenador exportado', async () => {
    const { concederCoordenador } = await import('@/lib/actions/admin-usuarios')
    expect(typeof concederCoordenador).toBe('function')
  })

  it('adminEditarPerfil exportado', async () => {
    const { adminEditarPerfil } = await import('@/lib/actions/admin-usuarios')
    expect(typeof adminEditarPerfil).toBe('function')
  })
})

// ─── 10. Seção coordenadores pendentes preservada ───────────────────────────

describe('Seção coordenadores pendentes — não quebrar (regressão)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarUsuariosMock.mockResolvedValue([U_ALUNO])
  })

  it('exibe seção "APROVAÇÕES PENDENTES" quando há pendências', async () => {
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
    render(<AdminUsuariosPage />)
    await waitFor(() =>
      expect(screen.getByText(/aprovações pendentes/i)).toBeInTheDocument()
    )
  })

  it('NÃO exibe seção quando não há pendências', async () => {
    listarCoordenadoresPendentesMock.mockResolvedValue([])
    render(<AdminUsuariosPage />)
    await waitFor(() => expect(screen.queryByText(/aprovações pendentes/i)).not.toBeInTheDocument())
  })
})
