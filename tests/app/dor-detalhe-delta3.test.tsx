/**
 * Delta 3 — DorDetalhe extensões:
 * - Autor editável vê seção de edição + AnexoUploader (não readOnly)
 * - Dor publicada mostra lista de anexos para download (readOnly)
 * - Admin vê botão "Remover" por anexo em dor publicada
 * - DoresPage botão aponta /app/dores/nova
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: vi.fn(), erro: vi.fn(), info: vi.fn(), dispensar: vi.fn() }),
}))

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

const { removerAnexoMock } = vi.hoisted(() => ({
  removerAnexoMock: vi.fn(),
}))

vi.mock('@/lib/actions/anexo', () => ({
  removerAnexo: (...args: unknown[]) => removerAnexoMock(...args),
  uploadAnexo: vi.fn(),
}))

// Stub do supabase/client (AnexoUploader usa createSupabaseBrowserClient)
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
}))

import { DorDetalhe } from '@/components/dores/DorDetalhe'
import { DoresPage } from '@/components/dores/DoresPage'

const ANEXO_1 = {
  id: 'anx-1',
  nome_original: 'proposta.pdf',
  mime_type: 'application/pdf',
  tamanho_bytes: 102400,
}

const ANEXO_2 = {
  id: 'anx-2',
  nome_original: 'dados.xlsx',
  mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  tamanho_bytes: 51200,
}

const DOR_RASCUNHO = {
  id: 'dor-rascunho',
  empresa_nome: 'Acme S.A.',
  descricao: 'Precisamos de automação para reduzir erros no processo industrial.',
  status: 'rascunho' as const,
  cursos: ['engenharia_de_software'],
  publicada_em: null,
  criada_em: '2026-06-01T00:00:00Z',
  aprovado_por: null,
  motivo_rejeicao: null,
  autor_id: 'user-autor',
}

const DOR_PUBLICADA = {
  id: 'dor-pub',
  empresa_nome: 'Acme S.A.',
  descricao: 'Precisamos de automação para reduzir erros no processo industrial.',
  status: 'publicada' as const,
  cursos: ['engenharia_de_software'],
  publicada_em: '2026-06-10T00:00:00Z',
  criada_em: '2026-06-01T00:00:00Z',
  aprovado_por: 'admin-1',
  motivo_rejeicao: null,
  autor_id: 'user-autor',
}

const DOR_REJEITADA = {
  ...DOR_RASCUNHO,
  id: 'dor-rej',
  status: 'rejeitada' as const,
  motivo_rejeicao: 'Precisa de mais detalhes.',
}

beforeEach(() => {
  editarDorMock.mockClear()
  removerAnexoMock.mockClear()
  submeterDorMock.mockClear()
})

// ─────────────────────────────────────────────────────────────
// Seção de EDIÇÃO para autor em rascunho
// ─────────────────────────────────────────────────────────────
describe('DorDetalhe — edição (autor + rascunho/rejeitada)', () => {
  it('autor de dor em rascunho vê seção de edição de descrição', () => {
    render(
      <DorDetalhe
        dor={DOR_RASCUNHO}
        currentUserId="user-autor"
        isAdmin={false}
        anexos={[]}
        isAutorEditavel={true}
      />
    )
    expect(screen.getByRole('textbox', { name: /descrição/i })).toBeInTheDocument()
  })

  it('seção de edição tem botão "Salvar"', () => {
    render(
      <DorDetalhe
        dor={DOR_RASCUNHO}
        currentUserId="user-autor"
        isAdmin={false}
        anexos={[]}
        isAutorEditavel={true}
      />
    )
    expect(screen.getByRole('button', { name: /salvar/i })).toBeInTheDocument()
  })

  it('salvar chama editarDor com dorId e nova descrição', async () => {
    editarDorMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(
      <DorDetalhe
        dor={DOR_RASCUNHO}
        currentUserId="user-autor"
        isAdmin={false}
        anexos={[]}
        isAutorEditavel={true}
      />
    )
    const textarea = screen.getByRole('textbox', { name: /descrição/i })
    await user.clear(textarea)
    await user.type(textarea, 'Descrição atualizada com mais detalhes do problema.')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() =>
      expect(editarDorMock).toHaveBeenCalledWith(expect.objectContaining({
        dorId: 'dor-rascunho',
        descricao: 'Descrição atualizada com mais detalhes do problema.',
      }))
    )
  })

  it('autor editável vê AnexoUploader não readOnly (dropzone presente)', () => {
    render(
      <DorDetalhe
        dor={DOR_RASCUNHO}
        currentUserId="user-autor"
        isAdmin={false}
        anexos={[]}
        isAutorEditavel={true}
      />
    )
    // Dropzone do AnexoUploader deve estar presente (não readOnly)
    expect(screen.getByRole('button', { name: /upload|anexo/i })).toBeInTheDocument()
  })

  it('autor editável vê aviso PII no uploader (RN15)', () => {
    render(
      <DorDetalhe
        dor={DOR_RASCUNHO}
        currentUserId="user-autor"
        isAdmin={false}
        anexos={[]}
        isAutorEditavel={true}
      />
    )
    expect(screen.getByText(/dados pessoais|sensíveis/i)).toBeInTheDocument()
  })

  it('terceiro NÃO vê seção de edição nem uploader', () => {
    render(
      <DorDetalhe
        dor={DOR_RASCUNHO}
        currentUserId="outro-user"
        isAdmin={false}
        anexos={[]}
        isAutorEditavel={false}
      />
    )
    // Dor em rascunho → terceiro vê locked
    expect(screen.getByText(/não está pública/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /salvar/i })).toBeNull()
  })

  it('dor rejeitada editável ainda mostra seção de edição', () => {
    render(
      <DorDetalhe
        dor={DOR_REJEITADA}
        currentUserId="user-autor"
        isAdmin={false}
        anexos={[]}
        isAutorEditavel={true}
      />
    )
    expect(screen.getByRole('textbox', { name: /descrição/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salvar/i })).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────
// Anexos em dor PUBLICADA — lista de download (readOnly)
// ─────────────────────────────────────────────────────────────
describe('DorDetalhe — anexos publicada (download)', () => {
  it('dor publicada com anexos exibe seção "Anexos"', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId={null}
        isAdmin={false}
        anexos={[{ ...ANEXO_1, signedUrl: 'https://example.com/proposta.pdf' }]}
        isAutorEditavel={false}
      />
    )
    expect(screen.getByRole('region', { name: /anexos/i })).toBeInTheDocument()
  })

  it('cada anexo é um link para download com nome do arquivo', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId={null}
        isAdmin={false}
        anexos={[{ ...ANEXO_1, signedUrl: 'https://example.com/proposta.pdf' }]}
        isAutorEditavel={false}
      />
    )
    const link = screen.getByRole('link', { name: /proposta\.pdf/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://example.com/proposta.pdf')
  })

  it('vários anexos exibem todos os links', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId={null}
        isAdmin={false}
        anexos={[
          { ...ANEXO_1, signedUrl: 'https://example.com/proposta.pdf' },
          { ...ANEXO_2, signedUrl: 'https://example.com/dados.xlsx' },
        ]}
        isAutorEditavel={false}
      />
    )
    expect(screen.getByRole('link', { name: /proposta\.pdf/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dados\.xlsx/i })).toBeInTheDocument()
  })

  it('dor publicada SEM anexos não exibe seção Anexos', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId={null}
        isAdmin={false}
        anexos={[]}
        isAutorEditavel={false}
      />
    )
    expect(screen.queryByRole('region', { name: /anexos/i })).toBeNull()
  })

  it('link de anexo tem atributo download (instrui o navegador a baixar)', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId={null}
        isAdmin={false}
        anexos={[{ ...ANEXO_1, signedUrl: 'https://example.com/proposta.pdf' }]}
        isAutorEditavel={false}
      />
    )
    const link = screen.getByRole('link', { name: /proposta\.pdf/i })
    expect(link).toHaveAttribute('download')
  })
})

// ─────────────────────────────────────────────────────────────
// Admin remove anexo impróprio
// ─────────────────────────────────────────────────────────────
describe('DorDetalhe — admin remove anexo (RN14)', () => {
  it('admin vê botão "Remover" para cada anexo', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="admin-user"
        isAdmin={true}
        anexos={[{ ...ANEXO_1, signedUrl: 'https://example.com/proposta.pdf' }]}
        isAutorEditavel={false}
      />
    )
    expect(screen.getByRole('button', { name: /remover proposta\.pdf/i })).toBeInTheDocument()
  })

  it('clicar "Remover" pede confirmação antes de chamar removerAnexo', async () => {
    // confirmação via window.confirm
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="admin-user"
        isAdmin={true}
        anexos={[{ ...ANEXO_1, signedUrl: 'https://example.com/proposta.pdf' }]}
        isAutorEditavel={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /remover proposta\.pdf/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(removerAnexoMock).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('admin confirma e removerAnexo é chamado com o id do anexo', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    removerAnexoMock.mockResolvedValue({ ok: true })
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="admin-user"
        isAdmin={true}
        anexos={[{ ...ANEXO_1, signedUrl: 'https://example.com/proposta.pdf' }]}
        isAutorEditavel={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /remover proposta\.pdf/i }))
    await waitFor(() =>
      expect(removerAnexoMock).toHaveBeenCalledWith('anx-1')
    )
    vi.restoreAllMocks()
  })

  it('leitor autenticado NÃO vê botão remover', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="leitor-user"
        isAdmin={false}
        anexos={[{ ...ANEXO_1, signedUrl: 'https://example.com/proposta.pdf' }]}
        isAutorEditavel={false}
      />
    )
    expect(screen.queryByRole('button', { name: /remover/i })).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────
// DoresPage — botão aponta /app/dores/nova
// ─────────────────────────────────────────────────────────────
describe('DoresPage — botão "Propor nova dor" aponta /app/dores/nova', () => {
  it('link "Propor nova dor" aponta para /app/dores/nova (não /propor)', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={true}
        isAutenticado={true}
      />
    )
    const link = screen.getByRole('link', { name: /propor nova dor/i })
    expect(link).toHaveAttribute('href', '/app/dores/nova')
  })

  it('link do estado vazio "Minhas dores" aponta para /app/dores/nova', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={true}
        isAutenticado={true}
      />
    )
    // Navega para aba "Minhas dores"
    fireEvent.click(screen.getByRole('tab', { name: /minhas dores/i }))
    const link = screen.getByRole('link', { name: /propor minha primeira dor/i })
    expect(link).toHaveAttribute('href', '/app/dores/nova')
  })
})
