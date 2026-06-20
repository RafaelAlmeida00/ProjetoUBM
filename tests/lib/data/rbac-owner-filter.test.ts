/**
 * RBAC — filtro de dono explícito nos adapters "do meu" (anti-vazamento de leitura).
 *
 * Causa raiz (bug /app/dores): os adapters que prometem retornar "o que é MEU" liam a tabela
 * direto e confiavam 100% no RLS para isolar o usuário. Mas várias tabelas têm policy de SELECT
 * mais ampla que "dono = auth.uid()" (RLS combina por OR), então o adapter devolvia linha de
 * terceiro para papéis que disparam a policy ampla:
 *   - indicacao     → indicacao_select_coord (coordenador-do-curso/admin vê indicações alheias)
 *   - membro_equipe → membro_equipe_select_publica (deleted_at is null → PÚBLICA)
 *   - funcao_tarefa → funcao_tarefa_select (is_team_member → qualquer membro vê tarefa de todos)
 *   - dor           → dor_select_publica (qualquer um vê dores publicadas)
 *
 * Invariante: todo adapter "do meu" DEVE filtrar a coluna do dono pelo auth.uid() e, sem sessão,
 * NÃO deve nem tocar a tabela. RLS é defesa em profundidade, não o isolamento do "meu".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: {
    user: { id: 'uid-1' } as { id: string } | null,
    resultByTable: {} as Record<string, { data: unknown; error: unknown }>,
    fromCalls: {} as Record<string, unknown[][]>,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    from(table: string) {
      const calls: unknown[][] = []
      state.fromCalls[table] = calls
      const result = () => state.resultByTable[table] ?? { data: [], error: null }
      const b: Record<string, unknown> = {
        select(...a: unknown[]) { calls.push(['select', ...a]); return b },
        eq(...a: unknown[]) { calls.push(['eq', ...a]); return b },
        is(...a: unknown[]) { calls.push(['is', ...a]); return b },
        order(...a: unknown[]) { calls.push(['order', ...a]); return b },
        limit(...a: unknown[]) { calls.push(['limit', ...a]); return Promise.resolve(result()) },
        single() { return Promise.resolve(state.resultByTable[table] ?? { data: null, error: null }) },
        then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
          return Promise.resolve(result()).then(res, rej)
        },
      }
      return b
    },
  })),
}))

import {
  obterMeusVinculosProjeto,
  listarMeusProjetos,
  listarMinhasTarefasAbertas,
  listarMinhasIndicacoes,
  contarMinhasDoresPorStatus,
} from '@/lib/data/projetos'

/** Pares [coluna, valor] passados a .eq() na query da tabela informada. */
function eqCalls(table: string): unknown[][] {
  return (state.fromCalls[table] ?? []).filter((c) => c[0] === 'eq').map((c) => [c[1], c[2]])
}

beforeEach(() => {
  state.user = { id: 'uid-1' }
  state.resultByTable = {}
  state.fromCalls = {}
})

describe('RBAC owner-filter — adapters "do meu" filtram pelo dono (não confiam só no RLS)', () => {
  it('obterMeusVinculosProjeto: filtra indicacao E membro_equipe por pessoa_id = uid', async () => {
    await obterMeusVinculosProjeto()
    expect(eqCalls('indicacao')).toContainEqual(['pessoa_id', 'uid-1'])
    expect(eqCalls('membro_equipe')).toContainEqual(['pessoa_id', 'uid-1'])
  })

  it('obterMeusVinculosProjeto: sem sessão NÃO consulta as tabelas e retorna vazio', async () => {
    state.user = null
    const r = await obterMeusVinculosProjeto()
    expect(state.fromCalls['indicacao']).toBeUndefined()
    expect(state.fromCalls['membro_equipe']).toBeUndefined()
    expect(r).toEqual({ indicadoProjetoIds: [], membroProjetoIds: [] })
  })

  it('listarMeusProjetos: filtra membro_equipe por pessoa_id = uid', async () => {
    await listarMeusProjetos()
    expect(eqCalls('membro_equipe')).toContainEqual(['pessoa_id', 'uid-1'])
  })

  it('listarMeusProjetos: sem sessão NÃO consulta membro_equipe', async () => {
    state.user = null
    const r = await listarMeusProjetos()
    expect(state.fromCalls['membro_equipe']).toBeUndefined()
    expect(r).toEqual([])
  })

  it('listarMinhasIndicacoes: filtra indicacao por pessoa_id = uid', async () => {
    await listarMinhasIndicacoes()
    expect(eqCalls('indicacao')).toContainEqual(['pessoa_id', 'uid-1'])
  })

  it('listarMinhasTarefasAbertas: filtra funcao_tarefa por responsavel_id = uid', async () => {
    await listarMinhasTarefasAbertas()
    expect(eqCalls('funcao_tarefa')).toContainEqual(['responsavel_id', 'uid-1'])
  })

  it('contarMinhasDoresPorStatus: filtra dor por autor_id = uid', async () => {
    await contarMinhasDoresPorStatus()
    expect(eqCalls('dor')).toContainEqual(['autor_id', 'uid-1'])
  })
})
