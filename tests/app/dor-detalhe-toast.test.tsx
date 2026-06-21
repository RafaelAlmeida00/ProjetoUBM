/**
 * Domínio C — toast wiring em DorDetalhe
 * Matriz (design-feedback.md §3.2):
 *   submeterDor  sucesso → "Dor enviada para análise."   erro → toast.erro
 *   editarDor    sucesso → "Alterações salvas."           erro → toast.erro
 *   removerAnexo sucesso → "Anexo removido."              erro → toast.erro (admin)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// ── Toast spies ────────────────────────────────────────────────────────────────
const toastSucesso = vi.fn()
const toastErro = vi.fn()

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: toastSucesso, erro: toastErro, info: vi.fn(), dispensar: vi.fn() }),
}))

// ── Action mocks ───────────────────────────────────────────────────────────────
const { submeterDorMock, editarDorMock } = vi.hoisted(() => ({
  submeterDorMock: vi.fn(),
  editarDorMock: vi.fn(),
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDor: (...args: unknown[]) => submeterDorMock(...args),
  editarDor: (...args: unknown[]) => editarDorMock(...args),
  moderarDor: vi.fn(),
  criarDor: vi.fn(),
}))

const { removerAnexoMock } = vi.hoisted(() => ({ removerAnexoMock: vi.fn() }))

vi.mock('@/lib/actions/anexo', () => ({
  removerAnexo: (...args: unknown[]) => removerAnexoMock(...args),
  uploadAnexo: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
  }),
}))

import { DorDetalhe } from '@/components/dores/DorDetalhe'
import type { DorData } from '@/components/dores/DorDetalhe'

const DOR_REJEITADA: DorData = {
  id: 'dor-rej',
  empresa_nome: 'Acme S.A.',
  descricao: 'Precisamos de automação para reduzir erros no processo industrial.',
  status: 'rejeitada',
  cursos: [],
  publicada_em: null,
  criada_em: '2026-06-01T00:00:00Z',
  aprovado_por: null,
  motivo_rejeicao: 'Precisa de mais detalhes.',
  autor_id: 'user-autor',
}

const DOR_EDITAVEL: DorData = {
  id: 'dor-pub',
  empresa_nome: 'Acme S.A.',
  descricao: 'Precisamos de automação para reduzir erros no processo industrial.',
  status: 'publicada',
  cursos: [],
  publicada_em: '2026-06-10T00:00:00Z',
  criada_em: '2026-06-01T00:00:00Z',
  aprovado_por: 'admin-1',
  motivo_rejeicao: null,
  autor_id: 'user-autor',
}

const ANEXO = {
  id: 'anx-1',
  nome_original: 'proposta.pdf',
  mime_type: 'application/pdf',
  tamanho_bytes: 102400,
  signedUrl: 'https://example.com/proposta.pdf',
}

beforeEach(() => {
  toastSucesso.mockClear()
  toastErro.mockClear()
  submeterDorMock.mockReset()
  editarDorMock.mockReset()
  removerAnexoMock.mockReset()
})

// ─────────────────────────────────────────────────────────────────────────────
// submeterDor (rejeitada → reenviar / rascunho → enviar)
// ─────────────────────────────────────────────────────────────────────────────
describe('DorDetalhe — toast: submeterDor', () => {
  it('sucesso → toast.sucesso("Dor enviada para análise.")', async () => {
    submeterDorMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(
      <DorDetalhe
        dor={DOR_REJEITADA}
        currentUserId="user-autor"
        isAdmin={false}
        timelineDor={[]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /corrigir e reenviar/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Dor enviada para análise.'))
  })

  it('erro → toast.erro com mensagem da action', async () => {
    submeterDorMock.mockResolvedValue({ ok: false, error: 'Conta não verificada.' })
    const user = userEvent.setup()
    render(
      <DorDetalhe
        dor={DOR_REJEITADA}
        currentUserId="user-autor"
        isAdmin={false}
        timelineDor={[]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /corrigir e reenviar/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith('Conta não verificada.'))
  })

  it('erro com mensagem vazia → toast.erro com copy padrão', async () => {
    submeterDorMock.mockResolvedValue({ ok: false, error: '' })
    const user = userEvent.setup()
    render(
      <DorDetalhe
        dor={DOR_REJEITADA}
        currentUserId="user-autor"
        isAdmin={false}
        timelineDor={[]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /corrigir e reenviar/i }))
    await waitFor(() =>
      expect(toastErro).toHaveBeenCalledWith(
        expect.stringMatching(/não foi possível enviar/i),
      ),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// editarDor
// ─────────────────────────────────────────────────────────────────────────────
describe('DorDetalhe — toast: editarDor', () => {
  it('sucesso → toast.sucesso("Alterações salvas.")', async () => {
    editarDorMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(
      <DorDetalhe
        dor={DOR_EDITAVEL}
        currentUserId="user-autor"
        isAdmin={false}
        isAutorEditavel
        timelineDor={[]}
      />,
    )
    // Limpa e digita nova descrição válida
    const textarea = screen.getByRole('textbox', { name: /descrição/i })
    await user.clear(textarea)
    await user.type(textarea, 'Nova descrição com detalhes suficientes.')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Alterações salvas.'))
  })

  it('erro → toast.erro com mensagem da action', async () => {
    editarDorMock.mockResolvedValue({ ok: false, error: 'Sem permissão.' })
    const user = userEvent.setup()
    render(
      <DorDetalhe
        dor={DOR_EDITAVEL}
        currentUserId="user-autor"
        isAdmin={false}
        isAutorEditavel
        timelineDor={[]}
      />,
    )
    const textarea = screen.getByRole('textbox', { name: /descrição/i })
    await user.clear(textarea)
    await user.type(textarea, 'Nova descrição com detalhes suficientes.')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith('Sem permissão.'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// removerAnexo (admin)
// ─────────────────────────────────────────────────────────────────────────────
describe('DorDetalhe — toast: removerAnexo (admin)', () => {
  it('sucesso → toast.sucesso("Anexo removido.")', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    removerAnexoMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(
      <DorDetalhe
        dor={DOR_EDITAVEL}
        currentUserId="admin-user"
        isAdmin
        anexos={[ANEXO]}
        timelineDor={[]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /remover proposta\.pdf/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Anexo removido.'))
    vi.restoreAllMocks()
  })

  it('erro → toast.erro com mensagem da action', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    removerAnexoMock.mockResolvedValue({ ok: false, error: 'Arquivo não encontrado.' })
    const user = userEvent.setup()
    render(
      <DorDetalhe
        dor={DOR_EDITAVEL}
        currentUserId="admin-user"
        isAdmin
        anexos={[ANEXO]}
        timelineDor={[]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /remover proposta\.pdf/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith('Arquivo não encontrado.'))
    vi.restoreAllMocks()
  })

  it('cancelar confirm → NÃO dispara toast', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(
      <DorDetalhe
        dor={DOR_EDITAVEL}
        currentUserId="admin-user"
        isAdmin
        anexos={[ANEXO]}
        timelineDor={[]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /remover proposta\.pdf/i }))
    expect(toastSucesso).not.toHaveBeenCalled()
    expect(toastErro).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
