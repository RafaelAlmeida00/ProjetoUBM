// @vitest-environment node
/**
 * 006 T5.4 (fix wiring) — /app/dores/[id] RSC DEVE computar e passar `papelProposta`
 * + `dadosProposta` ao DorDetalhe (RN18). Sem isso, SecaoProposta recebe papel=null e
 * mostra "DOCUMENTO RESTRITO" para TODOS (host/representante/coordenador/admin) — bug
 * "implementado mas não ligado". Visibilidade: admin + host-do-projeto + representante-
 * da-empresa-do-projeto + coordenação-do-projeto (is_project_coordinator = host+co_coord).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adapters, proposta } = vi.hoisted(() => ({
  adapters: {
    obterEquipePublica: vi.fn(async () => []),
    obterTimelinePublica: vi.fn(async () => []),
    listarFuncoesTarefas: vi.fn(async () => []),
    listarIndicacoes: vi.fn(async () => [] as unknown[]),
    listarEquipeGestao: vi.fn(async () => [] as unknown[]),
    obterMeusVinculosProjeto: vi.fn(async () => ({ membroProjetoIds: [], indicadoProjetoIds: [] })),
  },
  proposta: {
    lerDadosProposta: vi.fn(async (_projetoId: string, _papel: unknown) => ({ estadoProjeto: 'aguardando_proposta' })),
  },
}))

vi.mock('@/lib/data/projetos', () => ({
  obterEquipePublica: adapters.obterEquipePublica,
  obterTimelinePublica: adapters.obterTimelinePublica,
  listarFuncoesTarefas: adapters.listarFuncoesTarefas,
  listarIndicacoes: adapters.listarIndicacoes,
  listarEquipeGestao: adapters.listarEquipeGestao,
  obterMeusVinculosProjeto: adapters.obterMeusVinculosProjeto,
}))
vi.mock('@/lib/data/dores', () => ({ obterTimelineDor: vi.fn(async () => []) }))
vi.mock('@/lib/data/proposta', () => ({ lerDadosProposta: proposta.lerDadosProposta }))

const AUTOR = '00000000-0000-0000-0000-0000000000a0'
const HOST = '00000000-0000-0000-0000-0000000000b0'
const REP = '00000000-0000-0000-0000-0000000000d0'
const COORD = '00000000-0000-0000-0000-0000000000e0'
const ALUNO = '00000000-0000-0000-0000-0000000000c0'

const DOR_ROW = {
  id: 'dor-1', autor_id: AUTOR, empresa_id: 'emp-1', descricao: 'Dor publicada',
  status_dor: 'publicada', publicada_em: '2026-06-01T00:00:00Z', created_at: '2026-05-01T00:00:00Z',
  aprovado_por: 'admin-1', motivo_rejeicao: null, titulo: 'Automação',
}
const PROJETO_ROW = { id: 'proj-1', status: 'aguardando_proposta', host_coordenador_id: HOST, indicacoes_abertas: false }

function makeClient(
  user: { id: string; app_metadata?: Record<string, unknown> } | null,
  rpcMap: Record<string, boolean> = {},
) {
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
    rpc: vi.fn(async (name: string) => ({ data: rpcMap[name] ?? false, error: null })),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'x' }, error: null }) }) },
  }
}

let currentUser: { id: string; app_metadata?: Record<string, unknown> } | null = null
let currentRpc: Record<string, boolean> = {}
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => makeClient(currentUser, currentRpc)),
}))

async function renderLoader() {
  const { default: DorDetalhePage } = await import('@/app/app/dores/[id]/page')
  return DorDetalhePage({ params: Promise.resolve({ id: 'dor-1' }) }) as Promise<{ props: Record<string, unknown> }>
}

beforeEach(() => {
  vi.clearAllMocks()
  currentRpc = {}
  proposta.lerDadosProposta.mockResolvedValue({ estadoProjeto: 'aguardando_proposta' })
})

describe('006 T5.4 — wiring de papelProposta no loader /app/dores/[id]', () => {
  it('HOST do projeto → papelProposta="host" + lerDadosProposta(proj,"host")', async () => {
    currentUser = { id: HOST, app_metadata: {} }
    const el = await renderLoader()
    expect(el.props.papelProposta).toBe('host')
    expect(proposta.lerDadosProposta).toHaveBeenCalledWith('proj-1', 'host')
    expect(el.props.dadosProposta).toBeTruthy()
  })

  it('ADMIN → papelProposta="admin"', async () => {
    currentUser = { id: 'admin-x', app_metadata: { is_admin: true } }
    const el = await renderLoader()
    expect(el.props.papelProposta).toBe('admin')
  })

  it('REPRESENTANTE da empresa do projeto → papelProposta="representante"', async () => {
    currentUser = { id: REP, app_metadata: {} }
    currentRpc = { is_company_rep: true }
    const el = await renderLoader()
    expect(el.props.papelProposta).toBe('representante')
  })

  it('COORDENAÇÃO do projeto (is_project_coordinator) → papelProposta="coordenador"', async () => {
    currentUser = { id: COORD, app_metadata: {} }
    currentRpc = { is_project_coordinator: true }
    const el = await renderLoader()
    expect(el.props.papelProposta).toBe('coordenador')
  })

  it('ALUNO/terceiro (nenhum vínculo) → papelProposta null (peça lacrada)', async () => {
    currentUser = { id: ALUNO, app_metadata: {} }
    const el = await renderLoader()
    expect(el.props.papelProposta == null).toBe(true)
  })
})
