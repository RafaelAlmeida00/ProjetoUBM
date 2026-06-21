// @vitest-environment node
/**
 * 009 T4 — NÃO-VAZAMENTO de PII no loader de /app/dores/[id] (gate-de-fetch no SERVIDOR).
 * RS2/B1: PII (listarIndicacoes=nome/email; listarEquipeGestao=pessoa_id) só é BUSCADA dentro do
 * branch de gate. Aluno/não-membro/não-coord NÃO disparam esses fetches e o objeto servido ao
 * componente não carrega PII. NUNCA enfraquecer (hook protect-tests).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adapters } = vi.hoisted(() => ({
  adapters: {
    obterEquipePublica: vi.fn(async () => []),
    obterTimelinePublica: vi.fn(async () => []),
    listarFuncoesTarefas: vi.fn(async () => []),
    listarIndicacoes: vi.fn(async () => [] as unknown[]),
    listarEquipeGestao: vi.fn(async () => [] as unknown[]),
  },
}))

vi.mock('@/lib/data/projetos', () => ({
  obterEquipePublica: adapters.obterEquipePublica,
  obterTimelinePublica: adapters.obterTimelinePublica,
  listarFuncoesTarefas: adapters.listarFuncoesTarefas,
  listarIndicacoes: adapters.listarIndicacoes,
  listarEquipeGestao: adapters.listarEquipeGestao,
}))
vi.mock('@/lib/data/dores', () => ({ obterTimelineDor: vi.fn(async () => []) }))

const AUTOR = '00000000-0000-0000-0000-0000000000a0'
const HOST = '00000000-0000-0000-0000-0000000000b0'
const ALUNO = '00000000-0000-0000-0000-0000000000c0'

const DOR_ROW = {
  id: 'dor-1', autor_id: AUTOR, empresa_id: 'emp-1', descricao: 'Dor publicada',
  status_dor: 'publicada', publicada_em: '2026-06-01T00:00:00Z', created_at: '2026-05-01T00:00:00Z',
  aprovado_por: 'admin-1', motivo_rejeicao: null, titulo: 'Automação',
}
const PROJETO_ROW = { id: 'proj-1', status: 'aprovado', host_coordenador_id: HOST }

function makeClient(user: { id: string; app_metadata?: Record<string, unknown> } | null) {
  const results: Record<string, { data: unknown; error: null }> = {
    dor: { data: DOR_ROW, error: null },
    empresa: { data: { nome_canonico: 'ACME' }, error: null },
    dor_curso: { data: [], error: null },
    anexo_dor: { data: [], error: null },
    perfil: { data: { verificado_em: '2026-01-01' }, error: null },
    projeto: { data: PROJETO_ROW, error: null },
  }
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: (table: string) => {
      const res = results[table] ?? { data: null, error: null }
      const b: Record<string, unknown> = {
        select: () => b, eq: () => b, is: () => b, order: () => b, in: () => b,
        single: async () => res, maybeSingle: async () => res,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(res).then(resolve, reject),
      }
      return b
    },
    rpc: vi.fn(async () => ({ data: false, error: null })),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'x' }, error: null }) }) },
  }
}

let currentUser: { id: string; app_metadata?: Record<string, unknown> } | null = null
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => makeClient(currentUser)),
}))

async function renderLoader() {
  const { default: DorDetalhePage } = await import('@/app/app/dores/[id]/page')
  return DorDetalhePage({ params: Promise.resolve({ id: 'dor-1' }) }) as Promise<{ props: Record<string, unknown> }>
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.values(adapters).forEach((m) => m.mockClear?.())
  adapters.listarIndicacoes.mockResolvedValue([])
  adapters.listarEquipeGestao.mockResolvedValue([])
})

describe('009 T4 — gate-de-fetch de PII no loader /app/dores/[id]', () => {
  it('ALUNO (não admin/host/coord) → NÃO busca indicações nem gestão (zero PII)', async () => {
    currentUser = { id: ALUNO, app_metadata: {} }
    const el = await renderLoader()
    expect(adapters.listarIndicacoes).not.toHaveBeenCalled()
    expect(adapters.listarEquipeGestao).not.toHaveBeenCalled()
    // objeto servido ao componente sem PII
    expect(el.props.gestao ?? []).toEqual([])
    expect(el.props.indicacoesGrupos ?? []).toEqual([])
  })

  it('ADMIN → busca gestão (pessoa_id) E indicações', async () => {
    currentUser = { id: 'admin-x', app_metadata: { is_admin: true } }
    await renderLoader()
    expect(adapters.listarEquipeGestao).toHaveBeenCalledWith('proj-1')
    expect(adapters.listarIndicacoes).toHaveBeenCalledWith('proj-1')
  })

  it('HOST (não admin) → busca gestão', async () => {
    currentUser = { id: HOST, app_metadata: {} }
    await renderLoader()
    expect(adapters.listarEquipeGestao).toHaveBeenCalledWith('proj-1')
  })

  it('COORDENADOR aprovado (não admin/host) → busca indicações, NÃO gestão', async () => {
    currentUser = { id: 'coord-x', app_metadata: { roles: ['coordenador'], coord_aprovado: true } }
    await renderLoader()
    expect(adapters.listarIndicacoes).toHaveBeenCalledWith('proj-1')
    expect(adapters.listarEquipeGestao).not.toHaveBeenCalled()
  })
})
