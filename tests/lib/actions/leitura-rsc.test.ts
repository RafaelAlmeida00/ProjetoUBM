/**
 * T-O2.5 — TDD RED: testa os adapters de leitura RSC antes de existirem em
 * workspace/src/lib/data/projetos.ts
 *
 * Invariantes críticas (spec §10 + RS9):
 * - Vitrine pública chama RPCs equipe_publica/timeline_publica (NUNCA select de perfil para anon).
 * - Leitura interna usa createSupabaseServerClient (autenticado, RLS aplica).
 * - "em_analise sem equipe" distinto de "equipe vazia" (§10.5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRpc, mockFrom, mockSelect, mockEq, mockOrder, mockLimit } = vi.hoisted(() => {
  const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
  const mockOrder = vi.fn(() => ({ limit: mockLimit }))
  const mockEq = vi.fn(() => ({ order: mockOrder }))
  const mockSelect = vi.fn(() => ({ eq: mockEq, order: mockOrder }))
  const mockFrom = vi.fn(() => ({ select: mockSelect }))
  const mockRpc = vi.fn()
  return { mockRpc, mockFrom, mockSelect, mockEq, mockOrder, mockLimit }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: mockRpc,
    from: mockFrom,
  }),
}))

import {
  listarProjetosVitrine,
  obterEquipePublica,
  obterTimelinePublica,
  listarIndicacoes,
  listarFuncoesTarefas,
} from '@/lib/data/projetos'

describe('listarProjetosVitrine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockOrder.mockReturnValue({ limit: mockLimit })
    mockLimit.mockResolvedValue({ data: [], error: null })
  })

  it('retorna array vazio quando não há projetos', async () => {
    const result = await listarProjetosVitrine()
    expect(Array.isArray(result)).toBe(true)
  })

  it('lê da tabela projeto (não de perfil — RS9)', async () => {
    await listarProjetosVitrine()
    expect(mockFrom).toHaveBeenCalledWith('projeto')
    // Nunca deve chamar select de 'perfil' para anon
    const fromCalls = mockFrom.mock.calls.map((c) => c[0])
    expect(fromCalls).not.toContain('perfil')
  })

  it('retorna dados quando há projetos', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        { id: 'proj-1', status: 'aprovado', dor_id: 'dor-1' },
        { id: 'proj-2', status: 'em_analise', dor_id: 'dor-2' },
      ],
      error: null,
    })
    const result = await listarProjetosVitrine()
    expect(result).toHaveLength(2)
  })

  it('retorna array vazio em caso de erro (fail-soft)', async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: { message: 'db error' } })
    const result = await listarProjetosVitrine()
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })
})

describe('obterEquipePublica', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: [], error: null })
  })

  it('chama RPC equipe_publica (nunca select direto de perfil para anon — RS9)', async () => {
    await obterEquipePublica('proj-1')
    expect(mockRpc).toHaveBeenCalledWith('equipe_publica', { p_projeto_id: 'proj-1' })
    // Nunca select de perfil direto para vitrine pública
    expect(mockFrom).not.toHaveBeenCalledWith('perfil')
  })

  it('retorna dados da equipe pública', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { papel_projeto: 'host', nome_ou_papel: 'Prof. Silva', ranking_optin: true },
        { papel_projeto: 'aluno', nome_ou_papel: 'aluno · engenharia', ranking_optin: false },
      ],
      error: null,
    })
    const result = await obterEquipePublica('proj-1')
    expect(result).toHaveLength(2)
  })

  it('retorna array vazio em caso de erro', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc error' } })
    const result = await obterEquipePublica('proj-1')
    expect(result).toHaveLength(0)
  })

  it('resultado nunca contém pessoa_id/user_id cru (invariante RS9)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ papel_projeto: 'host', nome_ou_papel: 'host · adm', ranking_optin: false }],
      error: null,
    })
    const result = await obterEquipePublica('proj-1')
    for (const membro of result) {
      expect(membro).not.toHaveProperty('pessoa_id')
      expect(membro).not.toHaveProperty('user_id')
    }
  })
})

describe('obterTimelinePublica', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: [], error: null })
  })

  it('chama RPC timeline_publica (nunca select direto de perfil — RS9)', async () => {
    await obterTimelinePublica('proj-1')
    expect(mockRpc).toHaveBeenCalledWith('timeline_publica', { p_projeto_id: 'proj-1' })
    expect(mockFrom).not.toHaveBeenCalledWith('perfil')
  })

  it('retorna eventos da timeline', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { de_status: null, para_status: 'em_analise', ocorrido_em: '2026-01-01T00:00:00Z' },
        { de_status: 'em_analise', para_status: 'aprovado', ocorrido_em: '2026-01-10T00:00:00Z' },
      ],
      error: null,
    })
    const result = await obterTimelinePublica('proj-1')
    expect(result).toHaveLength(2)
  })

  it('retorna array vazio em caso de erro', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'err' } })
    const result = await obterTimelinePublica('proj-1')
    expect(result).toHaveLength(0)
  })
})

describe('listarIndicacoes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockEq.mockReturnValue({ order: mockOrder })
    mockOrder.mockResolvedValue({ data: [], error: null })
  })

  it('usa createSupabaseServerClient (autenticado, RLS aplica)', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    await listarIndicacoes('proj-1')
    expect(createSupabaseServerClient).toHaveBeenCalled()
  })

  it('lê da tabela indicacao filtrando por projeto_id', async () => {
    await listarIndicacoes('proj-1')
    expect(mockFrom).toHaveBeenCalledWith('indicacao')
    expect(mockEq).toHaveBeenCalledWith('projeto_id', 'proj-1')
  })

  it('retorna array vazio em caso de erro (fail-soft)', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'rls denied' } })
    const result = await listarIndicacoes('proj-1')
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('listarFuncoesTarefas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockEq.mockReturnValue({ order: mockOrder })
    mockOrder.mockResolvedValue({ data: [], error: null })
  })

  it('usa createSupabaseServerClient (autenticado, RLS aplica)', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    await listarFuncoesTarefas('proj-1')
    expect(createSupabaseServerClient).toHaveBeenCalled()
  })

  it('lê da tabela funcao_tarefa filtrando por projeto_id', async () => {
    await listarFuncoesTarefas('proj-1')
    expect(mockFrom).toHaveBeenCalledWith('funcao_tarefa')
    expect(mockEq).toHaveBeenCalledWith('projeto_id', 'proj-1')
  })

  it('retorna array vazio em caso de erro (fail-soft)', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'rls denied' } })
    const result = await listarFuncoesTarefas('proj-1')
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('distinção em_analise sem equipe vs equipe vazia (§10.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reconecta a cadeia fluente after clearAllMocks
    mockLimit.mockResolvedValue({ data: [], error: null })
    mockOrder.mockReturnValue({ limit: mockLimit })
    mockEq.mockReturnValue({ order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockFrom.mockReturnValue({ select: mockSelect })
    mockRpc.mockResolvedValue({ data: [], error: null })
  })

  it('obterEquipePublica retorna array vazio para projeto em_analise sem equipe', async () => {
    // Projeto em em_analise ainda não tem membro_equipe → RPC retorna []
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    const result = await obterEquipePublica('proj-sem-equipe')
    // O array vazio é o sinal de "em formação"; a tela distingue via status do projeto
    expect(result).toEqual([])
  })

  it('listarProjetosVitrine inclui status no dado retornado (permite distinção no RSC)', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [{ id: 'proj-1', status: 'em_analise', dor_id: 'dor-1' }],
      error: null,
    })
    const result = await listarProjetosVitrine()
    expect(result[0]).toHaveProperty('status')
    expect(result[0].status).toBe('em_analise')
  })
})
