/**
 * 009 — Adapter obterMeusVinculosProjeto (estendido com hostProjetoIds)
 * RED → GREEN: testa que MeusVinculosProjeto.hostProjetoIds existe e é preenchido
 * corretamente pela query de projeto.host_coordenador_id = auth.uid().
 *
 * Estratégia de mock: interceptamos `from(tabela)` por nome e retornamos dados
 * controlados pelo store `mockData` (mutável por teste).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Store mutável — cada teste seta antes de chamar o adapter
// ---------------------------------------------------------------------------
interface MockStore {
  indicacoes: { projeto_id: string }[]
  membros: { projeto_id: string }[]
  projetos: { id: string }[]
  indicacoesError: null | { message: string }
  membrosError: null | { message: string }
  projetosError: null | { message: string }
  userId: string | null
}

const store: MockStore = {
  indicacoes: [],
  membros: [],
  projetos: [],
  indicacoesError: null,
  membrosError: null,
  projetosError: null,
  userId: 'uid-coord-1',
}

// ---------------------------------------------------------------------------
// Mock do supabase — lê `store` no momento da chamada (closure late-binding)
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

// Importamos depois do mock para pegar o módulo mockado
import('@/lib/supabase/server').then(({ createSupabaseServerClient }) => {
  const mocked = vi.mocked(createSupabaseServerClient)

  mocked.mockImplementation(async () => {
    // Constrói o cliente fresh para cada chamada (lê store atual)
    const makeChain = (result: () => { data: unknown; error: unknown }) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => Promise.resolve(result()),
          }),
          is: () => Promise.resolve(result()),
        }),
        is: () => Promise.resolve(result()),
      }),
    })

    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: store.userId ? { id: store.userId } : null },
          error: null,
        }),
      },
      from: (tabela: string) => {
        if (tabela === 'indicacao') {
          return makeChain(() => ({ data: store.indicacoes, error: store.indicacoesError }))
        }
        if (tabela === 'membro_equipe') {
          return makeChain(() => ({ data: store.membros, error: store.membrosError }))
        }
        if (tabela === 'projeto') {
          return makeChain(() => ({ data: store.projetos, error: store.projetosError }))
        }
        return makeChain(() => ({ data: [], error: null }))
      },
    } as never
  })
})

import { obterMeusVinculosProjeto } from '@/lib/data/projetos'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reset() {
  store.indicacoes = []
  store.membros = []
  store.projetos = []
  store.indicacoesError = null
  store.membrosError = null
  store.projetosError = null
  store.userId = 'uid-coord-1'
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('obterMeusVinculosProjeto — hostProjetoIds', () => {
  beforeEach(reset)

  it('retorna objeto com propriedade hostProjetoIds', async () => {
    const result = await obterMeusVinculosProjeto()
    expect(result).toHaveProperty('hostProjetoIds')
    expect(Array.isArray(result.hostProjetoIds)).toBe(true)
  })

  it('retorna hostProjetoIds vazio quando não há projetos como host', async () => {
    const result = await obterMeusVinculosProjeto()
    expect(result.hostProjetoIds).toHaveLength(0)
  })

  it('popula hostProjetoIds com ids dos projetos onde é host', async () => {
    store.projetos = [{ id: 'proj-host-1' }, { id: 'proj-host-2' }]
    const result = await obterMeusVinculosProjeto()
    expect(result.hostProjetoIds).toContain('proj-host-1')
    expect(result.hostProjetoIds).toContain('proj-host-2')
  })

  it('degrada hostProjetoIds para [] em erro de banco (fail-soft)', async () => {
    store.projetosError = { message: 'permission denied' }
    const result = await obterMeusVinculosProjeto()
    expect(Array.isArray(result.hostProjetoIds)).toBe(true)
    expect(result.hostProjetoIds).toHaveLength(0)
  })

  it('mantém indicadoProjetoIds e membroProjetoIds funcionando junto com hostProjetoIds', async () => {
    store.indicacoes = [{ projeto_id: 'proj-ind-1' }]
    store.membros = [{ projeto_id: 'proj-mem-1' }]
    store.projetos = [{ id: 'proj-host-1' }]

    const result = await obterMeusVinculosProjeto()
    expect(result.indicadoProjetoIds).toContain('proj-ind-1')
    expect(result.membroProjetoIds).toContain('proj-mem-1')
    expect(result.hostProjetoIds).toContain('proj-host-1')
  })

  it('objeto vazio coerente quando user é null', async () => {
    store.userId = null
    const result = await obterMeusVinculosProjeto()
    expect(result.indicadoProjetoIds).toHaveLength(0)
    expect(result.membroProjetoIds).toHaveLength(0)
    expect(result.hostProjetoIds).toHaveLength(0)
  })
})
