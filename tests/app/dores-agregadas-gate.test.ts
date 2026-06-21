// @vitest-environment node
/**
 * 009 T18 (RN6/CA15) — gate-de-fetch da seção agregada no RSC /app/dores.
 * Só admin/coord-aprovado disparam listarProjetosVitrine + listarIndicacoes; aluno/representante
 * NUNCA buscam indicações (zero PII). Display por retorno: agregado vazio → prop vazia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adapters } = vi.hoisted(() => ({
  adapters: {
    obterMeusVinculosProjeto: vi.fn(async () => ({ indicadoProjetoIds: [], membroProjetoIds: [] })),
    listarProjetosVitrine: vi.fn(async () => [] as unknown[]),
    listarIndicacoes: vi.fn(async () => [] as unknown[]),
  },
}))

vi.mock('@/lib/data/projetos', () => ({
  obterMeusVinculosProjeto: adapters.obterMeusVinculosProjeto,
  listarProjetosVitrine: adapters.listarProjetosVitrine,
  listarIndicacoes: adapters.listarIndicacoes,
}))

const PROJ_ABERTO = { id: 'proj-1', status: 'em_analise', dor_id: 'dor-1', titulo: 'Automação', empresa_nome: 'Nissan', host_coordenador_id: null }
const IND = { id: 'i1', projeto_id: 'proj-1', pessoa_id: 'u1', papel_pretendido: 'aluno', mensagem: null, created_at: '2026-01-01', deleted_at: null, aluno_nome: 'R', aluno_email: 'r@e', curso: 'Eng' }

function makeClient(user: { id: string; app_metadata?: Record<string, unknown> } | null, papeis: string[]) {
  const results: Record<string, { data: unknown; error: null }> = {
    dor: { data: [], error: null },
    perfil: { data: { verificado_em: '2026-01-01' }, error: null },
    papel_usuario: { data: papeis.map((role) => ({ role })), error: null },
    empresa: { data: [], error: null },
    dor_curso: { data: [], error: null },
  }
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: (table: string) => {
      const res = results[table] ?? { data: null, error: null }
      const b: Record<string, unknown> = {
        select: () => b, eq: () => b, is: () => b, order: () => b, in: () => b, limit: () => b,
        single: async () => res, maybeSingle: async () => res,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(res).then(resolve, reject),
      }
      return b
    },
  }
}

let currentUser: { id: string; app_metadata?: Record<string, unknown> } | null = null
let currentPapeis: string[] = []
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => makeClient(currentUser, currentPapeis)),
}))

async function renderRoute() {
  const { default: DoresRoutePage } = await import('@/app/app/dores/page')
  return DoresRoutePage() as Promise<{ props: Record<string, unknown> }>
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.values(adapters).forEach((m) => m.mockClear?.())
  adapters.listarProjetosVitrine.mockResolvedValue([PROJ_ABERTO])
  adapters.listarIndicacoes.mockResolvedValue([IND])
})

describe('009 T18 — gate-de-fetch da seção agregada no RSC /app/dores', () => {
  it('ALUNO → NÃO busca indicações agregadas (zero PII); prop vazia', async () => {
    currentUser = { id: 'alu', app_metadata: {} }
    currentPapeis = ['aluno']
    const el = await renderRoute()
    expect(adapters.listarIndicacoes).not.toHaveBeenCalled()
    expect((el.props.indicacoesAgregadas as unknown[]) ?? []).toEqual([])
  })

  it('REPRESENTANTE → NÃO busca indicações agregadas', async () => {
    currentUser = { id: 'rep', app_metadata: {} }
    currentPapeis = ['representante']
    await renderRoute()
    expect(adapters.listarIndicacoes).not.toHaveBeenCalled()
  })

  it('ADMIN → busca e agrega (≥1 grupo com indicações)', async () => {
    currentUser = { id: 'adm', app_metadata: { is_admin: true } }
    currentPapeis = []
    const el = await renderRoute()
    expect(adapters.listarProjetosVitrine).toHaveBeenCalled()
    expect(adapters.listarIndicacoes).toHaveBeenCalledWith('proj-1')
    expect((el.props.indicacoesAgregadas as unknown[]).length).toBe(1)
  })

  it('COORDENADOR aprovado → busca e agrega', async () => {
    currentUser = { id: 'coord', app_metadata: { coord_aprovado: true } }
    currentPapeis = ['coordenador']
    const el = await renderRoute()
    expect(adapters.listarIndicacoes).toHaveBeenCalledWith('proj-1')
    expect((el.props.indicacoesAgregadas as unknown[]).length).toBe(1)
  })

  it('COORDENADOR não-aprovado → não agrega (gate fecha)', async () => {
    currentUser = { id: 'coord2', app_metadata: {} }
    currentPapeis = ['coordenador']
    await renderRoute()
    expect(adapters.listarIndicacoes).not.toHaveBeenCalled()
  })

  it('ADMIN com agregado vazio (RLS devolve []) → prop vazia (display por retorno)', async () => {
    currentUser = { id: 'adm', app_metadata: { is_admin: true } }
    currentPapeis = []
    adapters.listarIndicacoes.mockResolvedValue([])
    const el = await renderRoute()
    expect((el.props.indicacoesAgregadas as unknown[]) ?? []).toEqual([])
  })
})
