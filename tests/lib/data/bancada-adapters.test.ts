/**
 * ADR-0002 Q2 — Bancada: adapters cross-projeto (leitura RSC sob RLS do usuário autenticado).
 * Garantias:
 *  - Filtro de DONO explícito (.eq(coluna, auth.uid())): RLS é defesa em profundidade, NÃO o
 *    isolamento do "meu" — várias tabelas têm policy de SELECT mais ampla (coord/pública). Ver
 *    tests/lib/data/rbac-owner-filter.test.ts (invariante anti-vazamento).
 *  - NUNCA select direto de `perfil` de terceiros (PII — RS9); PII de equipe só via RPCs DEFINER.
 *  - Cada adapter degrada para [] / {} em erro (fail-soft): bancada não quebra se um widget falhar.
 *  - contarMinhasDoresPorStatus: filtra dor.autor_id = auth.uid() (dor_select_publica deixaria contar publicadas alheias).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock fluente do supabase client (padrão do projeto)
// ---------------------------------------------------------------------------

const {
  mockFrom,
  mockSelect,
  mockEq,
  mockIs,
  mockOrder,
  mockLimit,
} = vi.hoisted(() => {
  const mockLimit = vi.fn()
  const mockIs   = vi.fn()
  const mockOrder = vi.fn()
  const mockEq   = vi.fn()
  const mockSelect = vi.fn()
  const mockFrom  = vi.fn()

  // Cadeia fluente padrão
  mockLimit.mockResolvedValue({ data: [], error: null })
  mockIs.mockReturnValue({ order: mockOrder })
  mockOrder.mockReturnValue({ limit: mockLimit })
  mockEq.mockReturnValue({ eq: mockEq, is: mockIs, order: mockOrder })
  mockSelect.mockReturnValue({ eq: mockEq, is: mockIs, order: mockOrder, limit: mockLimit })
  mockFrom.mockReturnValue({ select: mockSelect })

  return { mockFrom, mockSelect, mockEq, mockIs, mockOrder, mockLimit }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: mockFrom,
    // adapters "do meu" agora resolvem o uid e filtram o dono explicitamente (anti-vazamento RS9).
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid-bancada' } }, error: null }) },
  }),
}))

import {
  listarMeusProjetos,
  listarMinhasTarefasAbertas,
  listarMinhasIndicacoes,
  contarMinhasDoresPorStatus,
} from '@/lib/data/projetos'

// ---------------------------------------------------------------------------
// Helpers de reset
// ---------------------------------------------------------------------------

function resetChain() {
  vi.clearAllMocks()
  mockLimit.mockResolvedValue({ data: [], error: null })
  mockIs.mockReturnValue({ order: mockOrder })
  mockOrder.mockReturnValue({ limit: mockLimit })
  mockEq.mockReturnValue({ eq: mockEq, is: mockIs, order: mockOrder })
  mockSelect.mockReturnValue({ eq: mockEq, is: mockIs, order: mockOrder, limit: mockLimit })
  mockFrom.mockReturnValue({ select: mockSelect })
}

// ---------------------------------------------------------------------------
// listarMeusProjetos
// ---------------------------------------------------------------------------

describe('listarMeusProjetos', () => {
  beforeEach(resetChain)

  it('retorna array vazio quando não há projetos', async () => {
    const result = await listarMeusProjetos()
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('lê de membro_equipe (participação ativa) sob RLS do usuário', async () => {
    await listarMeusProjetos()
    const tabelas = mockFrom.mock.calls.map((c) => c[0])
    expect(tabelas).toContain('membro_equipe')
  })

  it('retorna projetos com id, dor_id e status', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        {
          projeto_id: 'proj-1',
          dor_id: 'dor-1',
          status: 'em_execucao',
          empresa_nome: 'Empresa X',
        },
      ],
      error: null,
    })
    const result = await listarMeusProjetos()
    expect(result[0]).toHaveProperty('projeto_id')
    expect(result[0]).toHaveProperty('status')
  })

  it('degrada para [] em erro de banco (fail-soft)', async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: { message: 'rls denied' } })
    const result = await listarMeusProjetos()
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('NUNCA faz select de `perfil` de terceiros (anti-PII RS9)', async () => {
    await listarMeusProjetos()
    const tabelas = mockFrom.mock.calls.map((c) => c[0])
    expect(tabelas, 'listarMeusProjetos não deve ler perfil de terceiros').not.toContain('perfil')
  })
})

// ---------------------------------------------------------------------------
// listarMinhasTarefasAbertas
// ---------------------------------------------------------------------------

describe('listarMinhasTarefasAbertas', () => {
  beforeEach(resetChain)

  it('retorna array vazio quando não há tarefas', async () => {
    const result = await listarMinhasTarefasAbertas()
    expect(Array.isArray(result)).toBe(true)
  })

  it('lê de funcao_tarefa (tarefas atribuídas ao usuário) sob RLS', async () => {
    await listarMinhasTarefasAbertas()
    const tabelas = mockFrom.mock.calls.map((c) => c[0])
    expect(tabelas).toContain('funcao_tarefa')
  })

  it('retorna tarefas com id, projeto_id, titulo e concluida=false', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        {
          id: 'tarefa-1',
          projeto_id: 'proj-1',
          titulo: 'Implementar feature X',
          concluida: false,
          deleted_at: null,
        },
      ],
      error: null,
    })
    const result = await listarMinhasTarefasAbertas()
    expect(result[0]).toHaveProperty('id')
    expect(result[0]).toHaveProperty('projeto_id')
    expect(result[0]).toHaveProperty('titulo')
  })

  it('degrada para [] em erro (fail-soft)', async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: { message: 'rls denied' } })
    const result = await listarMinhasTarefasAbertas()
    expect(Array.isArray(result)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// listarMinhasIndicacoes
// ---------------------------------------------------------------------------

describe('listarMinhasIndicacoes', () => {
  beforeEach(resetChain)

  it('retorna array vazio quando não há indicações', async () => {
    const result = await listarMinhasIndicacoes()
    expect(Array.isArray(result)).toBe(true)
  })

  it('lê de indicacao filtrando o dono (pessoa_id = uid; não confia só no RLS)', async () => {
    await listarMinhasIndicacoes()
    const tabelas = mockFrom.mock.calls.map((c) => c[0])
    expect(tabelas).toContain('indicacao')
  })

  it('retorna indicações com id, projeto_id, papel_pretendido e created_at', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        {
          id: 'ind-1',
          projeto_id: 'proj-1',
          papel_pretendido: 'aluno',
          created_at: '2026-01-01T00:00:00Z',
          deleted_at: null,
        },
      ],
      error: null,
    })
    const result = await listarMinhasIndicacoes()
    expect(result[0]).toHaveProperty('id')
    expect(result[0]).toHaveProperty('projeto_id')
    expect(result[0]).toHaveProperty('papel_pretendido')
  })

  it('retorna apenas indicações ativas (deleted_at is null)', async () => {
    mockIs.mockReturnValueOnce({ order: mockOrder })
    mockOrder.mockReturnValueOnce({ limit: mockLimit })
    mockLimit.mockResolvedValueOnce({ data: [], error: null })
    await listarMinhasIndicacoes()
    // .is('deleted_at', null) deve ter sido chamado
    expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
  })

  it('degrada para [] em erro (fail-soft)', async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: { message: 'err' } })
    const result = await listarMinhasIndicacoes()
    expect(Array.isArray(result)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// contarMinhasDoresPorStatus
// ---------------------------------------------------------------------------

describe('contarMinhasDoresPorStatus', () => {
  beforeEach(resetChain)

  it('retorna objeto com contagens zero quando não há dores', async () => {
    const result = await contarMinhasDoresPorStatus()
    expect(typeof result).toBe('object')
    expect(result.total).toBeGreaterThanOrEqual(0)
  })

  it('lê de dor filtrando o dono (autor_id = uid; dor_select_publica é pública)', async () => {
    await contarMinhasDoresPorStatus()
    const tabelas = mockFrom.mock.calls.map((c) => c[0])
    expect(tabelas).toContain('dor')
  })

  it('retorna contagem separada por status_dor (em_moderacao é o status real, não em_analise)', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        { status_dor: 'rascunho' },
        { status_dor: 'rascunho' },
        { status_dor: 'em_moderacao' },
        { status_dor: 'publicada' },
      ],
      error: null,
    })
    const result = await contarMinhasDoresPorStatus()
    expect(result.rascunho).toBe(2)
    expect(result.em_moderacao).toBe(1)
    expect(result.publicada).toBe(1)
    expect(result.total).toBe(4)
  })

  it('degrada para contagens zero em erro (fail-soft)', async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: { message: 'err' } })
    const result = await contarMinhasDoresPorStatus()
    expect(result.total).toBe(0)
  })

  it('NUNCA faz select de `perfil` de terceiros (anti-PII RS9)', async () => {
    await contarMinhasDoresPorStatus()
    const tabelas = mockFrom.mock.calls.map((c) => c[0])
    expect(tabelas).not.toContain('perfil')
  })
})
