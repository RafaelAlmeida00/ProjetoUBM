/**
 * T-O2.5 — leituras RSC sob RLS (vitrine pública via RPC pseudonimizada; leitura interna autenticada).
 * Garantias (RS9 / RN23/RN24/CA23/CA24):
 *  - /casos NÃO faz select direto de `perfil` para anon — nome vem por RPC equipe_publica/timeline_publica
 *  - equipe_publica/timeline_publica acionados via supabase.rpc (não via .from('perfil'))
 *  - "em_analise sem equipe" ≠ "equipe vazia": `obterEquipePublica` retorna [] em ambos os casos,
 *    mas o caller distingue olhando `projeto.status`. Esta camada NÃO deve introduzir uma negativa
 *    que faça a UI confundir os dois estados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRpc, mockFrom, mockSelect, mockEq, mockOrder, mockLimit } = vi.hoisted(() => {
  const mockLimit = vi.fn()
  const mockOrder = vi.fn(() => ({ limit: mockLimit }))
  const mockEq = vi.fn(() => ({ order: mockOrder }))
  const mockSelect = vi.fn(() => ({ eq: mockEq, order: mockOrder, limit: mockLimit }))
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

describe('vitrine pública (anônimo) — RS9 / CA23 / CA24', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: [], error: null })
    mockLimit.mockResolvedValue({ data: [], error: null })
    mockOrder.mockReturnValue({ limit: mockLimit })
    mockEq.mockReturnValue({ order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder, limit: mockLimit })
    mockFrom.mockReturnValue({ select: mockSelect })
  })

  it('listarProjetosVitrine lê de `projeto` e NUNCA toca `perfil` (anti-vazamento de nome p/ anon)', async () => {
    await listarProjetosVitrine()
    const tabelas = mockFrom.mock.calls.map((c) => c[0])
    expect(tabelas).toContain('projeto')
    expect(tabelas, 'vitrine não deve ler `perfil` direto para anon').not.toContain('perfil')
  })

  it('obterEquipePublica chama RPC equipe_publica (não select de membro_equipe + perfil)', async () => {
    await obterEquipePublica('proj-1')
    expect(mockRpc).toHaveBeenCalledWith('equipe_publica', { p_projeto_id: 'proj-1' })
    expect(mockFrom).not.toHaveBeenCalledWith('perfil')
  })

  it('obterTimelinePublica chama RPC timeline_publica (NUNCA select de perfil para resolver autor)', async () => {
    await obterTimelinePublica('proj-1')
    expect(mockRpc).toHaveBeenCalledWith('timeline_publica', { p_projeto_id: 'proj-1' })
    expect(mockFrom).not.toHaveBeenCalledWith('perfil')
  })

  it('equipe vazia (em_analise sem equipe OU fechada sem membros) retorna [] — caller decide pelo status', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    const r = await obterEquipePublica('proj-em-analise')
    expect(Array.isArray(r)).toBe(true)
    expect(r).toHaveLength(0)
    // Não há erro lançado: o caller (página) escolhe a copy "Em análise" vs "Equipe vazia"
    // a partir de `projeto.status`, sem que esta camada force uma negativa enganosa.
  })

  it('erro de RPC degrada para [] (vitrine não quebra para anônimo)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const r = await obterTimelinePublica('proj-erro')
    expect(r).toEqual([])
  })
})

describe('leitura interna autenticada (RLS aplica)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLimit.mockResolvedValue({ data: [], error: null })
    mockOrder.mockResolvedValue({ data: [], error: null })
    mockEq.mockReturnValue({ order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder, limit: mockLimit })
    mockFrom.mockReturnValue({ select: mockSelect })
  })

  it('listarIndicacoes chama RPC indicacoes_coordenador (identidade gated por coord-do-curso-APROVADO/admin — RN25/CA25; #6)', async () => {
    // Pós-#6 (0052/0053): listarIndicacoes deixou de ler a tabela `indicacao` direto e passou
    // a chamar a RPC DEFINER `indicacoes_coordenador`, que devolve nome/email/curso do candidato
    // só ao coordenador-do-curso APROVADO ou admin (gate interno). Contrato mais estrito, não enfraquecido.
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    await listarIndicacoes('proj-1')
    expect(mockRpc).toHaveBeenCalledWith('indicacoes_coordenador', { p_projeto_id: 'proj-1' })
    expect(mockFrom).not.toHaveBeenCalledWith('indicacao')
  })

  it('listarFuncoesTarefas lê de `funcao_tarefa` (RLS: membros + admin — RN21/RN22)', async () => {
    await listarFuncoesTarefas('proj-1')
    expect(mockFrom).toHaveBeenCalledWith('funcao_tarefa')
    expect(mockEq).toHaveBeenCalledWith('projeto_id', 'proj-1')
  })
})
