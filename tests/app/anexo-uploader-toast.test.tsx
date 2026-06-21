/**
 * Domínio C — toast wiring em AnexoUploader
 * Matriz (design-feedback.md §3.2):
 *   uploadAnexo  sucesso → "Anexo enviado."
 *   uploadAnexo  erro    → toast.erro (storage ou action)
 *   removerAnexo sucesso → "Anexo removido."
 *   removerAnexo erro    → toast.erro
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// ── Toast spies ────────────────────────────────────────────────────────────────
const toastSucesso = vi.fn()
const toastErro = vi.fn()

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: toastSucesso, erro: toastErro, info: vi.fn(), dispensar: vi.fn() }),
}))

// ── Action mocks ───────────────────────────────────────────────────────────────
const { uploadAnexoMock, removerAnexoMock } = vi.hoisted(() => ({
  uploadAnexoMock: vi.fn(),
  removerAnexoMock: vi.fn(),
}))

vi.mock('@/lib/actions/anexo', () => ({
  uploadAnexo: (...args: unknown[]) => uploadAnexoMock(...args),
  removerAnexo: (...args: unknown[]) => removerAnexoMock(...args),
}))

// ── Supabase storage mock ──────────────────────────────────────────────────────
const uploadStorageMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    storage: {
      from: () => ({ upload: uploadStorageMock }),
    },
  }),
}))

import { AnexoUploader } from '@/components/anexos/AnexoUploader'
import type { AnexoMeta } from '@/components/anexos/AnexoUploader'

const ANEXO_EXISTENTE: AnexoMeta = {
  id: 'anx-existing',
  nome_original: 'existente.pdf',
  mime_type: 'application/pdf',
  tamanho_bytes: 1024,
}

function criarArquivoValido(nome = 'teste.pdf', tipo = 'application/pdf', tamanho = 1024) {
  return new File([new ArrayBuffer(tamanho)], nome, { type: tipo })
}

beforeEach(() => {
  toastSucesso.mockClear()
  toastErro.mockClear()
  uploadAnexoMock.mockReset()
  removerAnexoMock.mockReset()
  uploadStorageMock.mockReset()
})

// ─────────────────────────────────────────────────────────────────────────────
// uploadAnexo
// ─────────────────────────────────────────────────────────────────────────────
describe('AnexoUploader — toast: uploadAnexo', () => {
  it('upload com sucesso → toast.sucesso("Anexo enviado.")', async () => {
    uploadStorageMock.mockResolvedValue({ error: null })
    uploadAnexoMock.mockResolvedValue({
      ok: true,
      anexo: { id: 'anx-new', nome_original: 'teste.pdf', mime_type: 'application/pdf', tamanho_bytes: 1024 },
    })

    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, criarArquivoValido())

    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Anexo enviado.'))
  })

  it('erro no storage → toast.erro com copy de verificação', async () => {
    uploadStorageMock.mockResolvedValue({ error: new Error('network error') })

    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, criarArquivoValido())

    await waitFor(() =>
      expect(toastErro).toHaveBeenCalledWith(
        expect.stringMatching(/não foi possível enviar o anexo/i),
      ),
    )
    expect(toastSucesso).not.toHaveBeenCalled()
  })

  it('erro na action uploadAnexo → toast.erro com mensagem da action', async () => {
    uploadStorageMock.mockResolvedValue({ error: null })
    uploadAnexoMock.mockResolvedValue({ ok: false, error: 'Tamanho excedido no servidor.' })

    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, criarArquivoValido())

    await waitFor(() =>
      expect(toastErro).toHaveBeenCalledWith('Tamanho excedido no servidor.'),
    )
    expect(toastSucesso).not.toHaveBeenCalled()
  })

  it('tipo inválido (validação local) → NÃO dispara toast (erro é inline)', async () => {
    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, criarArquivoValido('virus.exe', 'application/x-msdownload'))

    // Validação local: inline, sem toast
    expect(toastErro).not.toHaveBeenCalled()
    expect(toastSucesso).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// removerAnexo
// ─────────────────────────────────────────────────────────────────────────────
describe('AnexoUploader — toast: removerAnexo', () => {
  it('remover com sucesso → toast.sucesso("Anexo removido.")', async () => {
    removerAnexoMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={[ANEXO_EXISTENTE]} />)

    await user.click(screen.getByRole('button', { name: /remover existente\.pdf/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Anexo removido.'))
  })

  it('remover com erro → toast.erro com mensagem da action', async () => {
    removerAnexoMock.mockResolvedValue({ ok: false, error: 'Permissão negada.' })
    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={[ANEXO_EXISTENTE]} />)

    await user.click(screen.getByRole('button', { name: /remover existente\.pdf/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith('Permissão negada.'))
    expect(toastSucesso).not.toHaveBeenCalled()
  })

  it('remover com erro vazio → toast.erro com copy padrão', async () => {
    removerAnexoMock.mockResolvedValue({ ok: false, error: '' })
    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={[ANEXO_EXISTENTE]} />)

    await user.click(screen.getByRole('button', { name: /remover existente\.pdf/i }))
    await waitFor(() =>
      expect(toastErro).toHaveBeenCalledWith(
        expect.stringMatching(/não foi possível remover o anexo/i),
      ),
    )
  })
})
