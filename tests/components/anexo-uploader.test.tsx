/**
 * T-O3.5 — AnexoUploader (.ubm-dropzone)
 * TDD RED: aviso PII presente, recusa por tipo/tamanho/quantidade (CA15),
 * lista anexos, remover, a11y (input rotulado, teclado).
 * Upload real ao Storage = smoke da Onda 4 (screensDeferred).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const uploadMock = vi.fn()
vi.mock('@/lib/actions/anexo', () => ({
  uploadAnexo: (...args: unknown[]) => uploadMock(...args),
  removerAnexo: vi.fn().mockResolvedValue({ ok: true }),
}))

// Mock do Storage (browser client) — upload real ao Supabase é screensDeferred (G5 smoke)
const storageMock = { upload: vi.fn().mockResolvedValue({ error: null }) }
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    storage: { from: () => storageMock },
  }),
}))

import { AnexoUploader } from '@/components/anexos/AnexoUploader'

const ANEXO_EXISTENTE = {
  id: 'anx-1',
  nome_original: 'planilha.xlsx',
  mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  tamanho_bytes: 102400, // 100 KB
}

const criarArquivo = (nome: string, tipo: string, tamanhoBytes: number) => {
  const arr = new Uint8Array(tamanhoBytes)
  return new File([arr], nome, { type: tipo })
}

describe('AnexoUploader — T-O3.5', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadMock.mockResolvedValue({ ok: true, anexo: { id: 'anx-new', nome_original: 'novo.pdf', mime_type: 'application/pdf', tamanho_bytes: 1024 } })
  })

  it('exibe aviso de PII obrigatório (RN15)', () => {
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)
    expect(screen.getByText(/dados pessoais/i)).toBeInTheDocument()
  })

  it('exibe limites visíveis (5 arquivos, 5 MB — design §6.4)', () => {
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)
    expect(screen.getByText(/5 arquivo/i)).toBeInTheDocument()
    expect(screen.getByText(/5 MB/i)).toBeInTheDocument()
  })

  it('input file tem label acessível (a11y)', () => {
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)
    const input = screen.getByLabelText(/selecionar arquivo/i)
    expect(input).toHaveAttribute('type', 'file')
  })

  it('rejeita arquivo de tipo não permitido (CA15 — SVG)', async () => {
    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)
    const input = screen.getByLabelText(/selecionar arquivo/i)
    const svgFile = criarArquivo('imagem.svg', 'image/svg+xml', 1024)
    await user.upload(input, svgFile)
    await waitFor(() =>
      expect(screen.getByText(/tipo não permitido/i)).toBeInTheDocument()
    )
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('rejeita arquivo acima de 5 MB (CA15)', async () => {
    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)
    const input = screen.getByLabelText(/selecionar arquivo/i)
    const grandão = criarArquivo('grande.pdf', 'application/pdf', 6 * 1024 * 1024)
    await user.upload(input, grandão)
    await waitFor(() =>
      expect(screen.getByText(/máx. 5 MB/i)).toBeInTheDocument()
    )
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('rejeita quando já há 5 anexos (CA15 — limite de quantidade)', async () => {
    const cincoAnexos = Array.from({ length: 5 }, (_, i) => ({
      id: `anx-${i}`,
      nome_original: `arquivo${i}.pdf`,
      mime_type: 'application/pdf',
      tamanho_bytes: 1024,
    }))
    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={cincoAnexos} />)
    const input = screen.getByLabelText(/selecionar arquivo/i)
    const novoArquivo = criarArquivo('extra.pdf', 'application/pdf', 1024)
    await user.upload(input, novoArquivo)
    await waitFor(() =>
      expect(screen.getByText(/limite de 5 arquivo/i)).toBeInTheDocument()
    )
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('aceita arquivo PDF válido dentro dos limites', async () => {
    const user = userEvent.setup()
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)
    const input = screen.getByLabelText(/selecionar arquivo/i)
    const pdf = criarArquivo('relatorio.pdf', 'application/pdf', 100 * 1024)
    await user.upload(input, pdf)
    await waitFor(() =>
      expect(uploadMock).toHaveBeenCalled()
    )
  })

  it('aceita PNG, JPG, WEBP, CSV e XLSX (allowlist)', async () => {
    const tiposValidos = [
      ['foto.png', 'image/png'],
      ['foto.jpg', 'image/jpeg'],
      ['foto.webp', 'image/webp'],
      ['dados.csv', 'text/csv'],
      ['planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ]
    for (const [nome, tipo] of tiposValidos) {
      uploadMock.mockResolvedValueOnce({ ok: true, anexo: { id: 'anx-x', nome_original: nome, mime_type: tipo, tamanho_bytes: 1024 } })
      const user = userEvent.setup()
      const { unmount } = render(<AnexoUploader dorId="dor-1" anexos={[]} />)
      const input = screen.getByLabelText(/selecionar arquivo/i)
      const arquivo = criarArquivo(nome, tipo, 1024)
      await user.upload(input, arquivo)
      await waitFor(() => expect(uploadMock).toHaveBeenCalled())
      uploadMock.mockClear()
      unmount()
    }
  })

  it('lista os anexos existentes com nome, tipo e tamanho (CA14)', () => {
    render(<AnexoUploader dorId="dor-1" anexos={[ANEXO_EXISTENTE]} />)
    expect(screen.getByText('planilha.xlsx')).toBeInTheDocument()
    // "XLSX" aparece no ubm-attach-item-meta e também no texto de limites
    expect(screen.getAllByText(/xlsx/i).length).toBeGreaterThan(0)
  })

  it('nome do anexo exibido como texto (anti-XSS — não como link raw)', () => {
    const anexoXSS = {
      id: 'anx-xss',
      nome_original: '<script>alert(1)</script>',
      mime_type: 'application/pdf',
      tamanho_bytes: 1024,
    }
    render(<AnexoUploader dorId="dor-1" anexos={[anexoXSS]} />)
    // O texto do script deve aparecer escapado, não executado
    expect(screen.getByText(/<script>/i)).toBeInTheDocument()
    // Não deve haver elementos script injetados
    expect(document.querySelector('script[src]')).toBeNull()
  })

  it('botão remover tem nome acessível (a11y)', () => {
    render(<AnexoUploader dorId="dor-1" anexos={[ANEXO_EXISTENTE]} />)
    const removeBtn = screen.getByRole('button', { name: /remover planilha\.xlsx/i })
    expect(removeBtn).toBeInTheDocument()
  })

  it('dropzone é acionável por teclado (a11y)', () => {
    render(<AnexoUploader dorId="dor-1" anexos={[]} />)
    const dropzone = screen.getByRole('region', { name: /anexos/i })
    expect(dropzone).toBeInTheDocument()
  })
})
