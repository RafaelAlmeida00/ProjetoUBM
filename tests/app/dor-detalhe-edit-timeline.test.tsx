/**
 * Delta-edição — DorDetalhe:
 * - Autor pode editar dor PUBLICADA e EM_MODERACAO (não só rascunho/rejeitada)
 * - Aviso de re-moderação antes de salvar (publicada/em_moderacao)
 * - Aba "Linha do tempo da dor" renderiza eventos de timelineDor
 * - Não-autor não vê edição
 * - Estados vazios humanizados na timeline da dor
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: vi.fn(), erro: vi.fn(), info: vi.fn(), dispensar: vi.fn() }),
}))

const { editarDorMock } = vi.hoisted(() => ({
  editarDorMock: vi.fn(),
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDor: vi.fn().mockResolvedValue({ ok: true }),
  editarDor: (...args: unknown[]) => editarDorMock(...args),
  moderarDor: vi.fn(),
  criarDor: vi.fn(),
}))

vi.mock('@/lib/actions/anexo', () => ({
  removerAnexo: vi.fn().mockResolvedValue({ ok: true }),
  uploadAnexo: vi.fn(),
}))

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
import type { DorData } from '@/components/dores/DorDetalhe'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DOR_PUBLICADA: DorData = {
  id: 'dor-pub',
  empresa_nome: 'Acme S.A.',
  descricao: 'Precisamos de automação para reduzir erros no processo industrial.',
  status: 'publicada',
  cursos: ['engenharia_de_software'],
  publicada_em: '2026-06-10T00:00:00Z',
  criada_em: '2026-06-01T00:00:00Z',
  aprovado_por: 'admin-1',
  motivo_rejeicao: null,
  autor_id: 'user-autor',
}

const DOR_EM_MODERACAO: DorData = {
  id: 'dor-mod',
  empresa_nome: 'Acme S.A.',
  descricao: 'Precisamos de automação para reduzir erros no processo industrial.',
  status: 'em_moderacao',
  cursos: ['engenharia_de_software'],
  publicada_em: null,
  criada_em: '2026-06-01T00:00:00Z',
  aprovado_por: null,
  motivo_rejeicao: null,
  autor_id: 'user-autor',
}

const TIMELINE_DOR = [
  {
    tipo: 'criada',
    ocorreu_em: '2026-06-01T10:00:00Z',
    ator_papel: 'representante',
    rotulo: 'Dor criada',
  },
  {
    tipo: 'enviada_moderacao',
    ocorreu_em: '2026-06-02T09:00:00Z',
    ator_papel: 'representante',
    rotulo: 'Enviada para moderação',
  },
  {
    tipo: 'publicada',
    ocorreu_em: '2026-06-10T14:00:00Z',
    ator_papel: 'admin',
    rotulo: 'Publicada',
  },
]

beforeEach(() => {
  editarDorMock.mockClear()
})

// ─── 1. Autor edita dor PUBLICADA (isAutorEditavel=true) ─────────────────────
describe('DorDetalhe — autor edita dor publicada', () => {
  it('autor com isAutorEditavel=true vê seção de edição mesmo em dor publicada', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="user-autor"
        isAdmin={false}
        isAutorEditavel={true}
        timelineDor={[]}
      />
    )
    expect(screen.getByRole('textbox', { name: /descrição/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salvar/i })).toBeInTheDocument()
  })

  it('autor com isAutorEditavel=true em dor publicada vê AnexoUploader', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="user-autor"
        isAdmin={false}
        isAutorEditavel={true}
        timelineDor={[]}
      />
    )
    expect(screen.getByRole('button', { name: /upload|anexo/i })).toBeInTheDocument()
  })

  it('autor com isAutorEditavel=true em dor em_moderacao vê seção de edição', () => {
    render(
      <DorDetalhe
        dor={DOR_EM_MODERACAO}
        currentUserId="user-autor"
        isAdmin={false}
        isAutorEditavel={true}
        timelineDor={[]}
      />
    )
    expect(screen.getByRole('textbox', { name: /descrição/i })).toBeInTheDocument()
  })

  it('não-autor com isAutorEditavel=false NÃO vê seção de edição em dor publicada', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="outro-user"
        isAdmin={false}
        isAutorEditavel={false}
        timelineDor={[]}
      />
    )
    expect(screen.queryByRole('textbox', { name: /descrição/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /salvar/i })).toBeNull()
  })
})

// ─── 2. Aviso de re-moderação antes de salvar (dor publicada/em_moderacao) ───
describe('DorDetalhe — aviso de re-moderação (cybersecurity ruling)', () => {
  it('dor publicada: aviso de re-moderação é visível na seção de edição', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="user-autor"
        isAdmin={false}
        isAutorEditavel={true}
        timelineDor={[]}
      />
    )
    // Aviso deve conter referência a moderação/vitrine/re-moderação
    // (escopado ao note de re-moderação — "Em Moderação" do badge de status colidiria)
    expect(screen.getByRole('note', { name: /re-moderação/i })).toHaveTextContent(/moderação|vitrine/i)
  })

  it('dor em_moderacao: aviso de re-moderação é visível na seção de edição', () => {
    render(
      <DorDetalhe
        dor={DOR_EM_MODERACAO}
        currentUserId="user-autor"
        isAdmin={false}
        isAutorEditavel={true}
        timelineDor={[]}
      />
    )
    expect(screen.getByRole('note', { name: /re-moderação/i })).toHaveTextContent(/moderação|vitrine/i)
  })

  it('dor rascunho: aviso de re-moderação NÃO aparece', () => {
    const dorRascunho: DorData = {
      id: 'dor-rascunho',
      empresa_nome: 'Acme',
      descricao: 'Precisamos de automação para reduzir erros industriais.',
      status: 'rascunho',
      cursos: [],
      publicada_em: null,
      criada_em: '2026-06-01T00:00:00Z',
      aprovado_por: null,
      motivo_rejeicao: null,
      autor_id: 'user-autor',
    }
    render(
      <DorDetalhe
        dor={dorRascunho}
        currentUserId="user-autor"
        isAdmin={false}
        isAutorEditavel={true}
        timelineDor={[]}
      />
    )
    // Não deve ter aviso de que vai sair da vitrine (dor em rascunho não está na vitrine)
    expect(screen.queryByText(/sai da vitrine/i)).toBeNull()
  })

  it('salvar chama editarDor mesmo com aviso visível (não bloqueia)', async () => {
    editarDorMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId="user-autor"
        isAdmin={false}
        isAutorEditavel={true}
        timelineDor={[]}
      />
    )
    const textarea = screen.getByRole('textbox', { name: /descrição/i })
    await user.clear(textarea)
    await user.type(textarea, 'Nova descrição com mais de dez caracteres.')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() =>
      expect(editarDorMock).toHaveBeenCalledWith(expect.objectContaining({
        dorId: 'dor-pub',
      }))
    )
  })
})

// ─── 3. Linha do tempo DA DOR (timelineDor prop) ─────────────────────────────
describe('DorDetalhe — aba linha do tempo da dor (timelineDor)', () => {
  it('aba "Linha do tempo da dor" renderiza eventos de timelineDor', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId={null}
        isAdmin={false}
        isAutorEditavel={false}
        timelineDor={TIMELINE_DOR}
      />
    )
    // BUG #1: "projeto" é a 1ª/default; precisa clicar em "dor" para ver seu painel.
    fireEvent.click(screen.getByRole('tab', { name: 'Linha do tempo da dor' }))
    // Deve encontrar rótulos dos eventos (escopado à lista da timeline da dor —
    // "Publicada" também aparece no badge de status)
    const tl = within(screen.getByLabelText('Histórico de eventos da dor'))
    expect(tl.getByText('Dor criada')).toBeInTheDocument()
    expect(tl.getByText('Publicada')).toBeInTheDocument()
  })

  it('mostra papel do ator para cada evento', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId={null}
        isAdmin={false}
        isAutorEditavel={false}
        timelineDor={TIMELINE_DOR}
      />
    )
    // BUG #1: navega para a aba "dor" antes de consultar seu painel
    fireEvent.click(screen.getByRole('tab', { name: 'Linha do tempo da dor' }))
    // Papel do ator formatado (representante/admin)
    expect(screen.getAllByText(/representante|admin/i).length).toBeGreaterThan(0)
  })

  it('mostra data formatada em pt-BR para eventos com ocorreu_em', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId={null}
        isAdmin={false}
        isAutorEditavel={false}
        timelineDor={TIMELINE_DOR}
      />
    )
    // BUG #1: navega para a aba "dor" antes de consultar seu painel
    fireEvent.click(screen.getByRole('tab', { name: 'Linha do tempo da dor' }))
    // Data de '2026-06-01' em pt-BR → contém "jun" ou "01/06"
    // (escopado à timeline — há 3 eventos, todos com data; getByText global colidiria)
    const tl = within(screen.getByLabelText('Histórico de eventos da dor'))
    expect(tl.getAllByText(/jun|01\/06/i).length).toBeGreaterThan(0)
  })

  it('estado vazio: timelineDor=[] exibe mensagem humanizada', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId={null}
        isAdmin={false}
        isAutorEditavel={false}
        timelineDor={[]}
      />
    )
    // Mensagem de vazio humanizada
    expect(
      screen.getByText(/nenhum evento|histórico.*vazio|sem eventos/i)
    ).toBeInTheDocument()
  })

  it('aba "Linha do tempo da dor" preserva aba "Equipe" (005) existente', () => {
    render(
      <DorDetalhe
        dor={DOR_PUBLICADA}
        currentUserId={null}
        isAdmin={false}
        isAutorEditavel={false}
        timelineDor={[]}
      />
    )
    // Aba de equipe do projeto ainda existe
    expect(screen.getByRole('tab', { name: /equipe/i })).toBeInTheDocument()
  })
})

// ─── 4. obterTimelineDor (reader) ─────────────────────────────────────────────
// Testado via mock do supabase — verifica que a função chama rpc correta
describe('obterTimelineDor — lib/data/dores', () => {
  it('chama rpc ler_timeline_dor com o dorId correto', async () => {
    vi.resetModules() // isola o módulo p/ pegar o doMock deste teste (evita cache entre casos)
    const rpcMock = vi.fn().mockResolvedValue({ data: TIMELINE_DOR, error: null })
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: async () => ({
        rpc: rpcMock,
      }),
    }))
    // Import dinâmico para pegar o módulo com o mock aplicado
    const { obterTimelineDor } = await import('@/lib/data/dores')
    await obterTimelineDor('dor-pub')
    expect(rpcMock).toHaveBeenCalledWith('ler_timeline_dor', { p_dor_id: 'dor-pub' })
  })

  it('retorna array vazio em caso de erro', async () => {
    vi.resetModules() // isola o módulo p/ pegar o doMock deste teste (evita cache do caso anterior)
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'err' } })
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: async () => ({
        rpc: rpcMock,
      }),
    }))
    const { obterTimelineDor } = await import('@/lib/data/dores')
    const result = await obterTimelineDor('qualquer')
    expect(result).toEqual([])
  })
})
