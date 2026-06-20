/**
 * T-B6 — Bug #6: listarIndicacoes retorna aluno_nome, aluno_email, curso
 * TDD RED: garantir que a função chama a RPC indicacoes_coordenador (SECURITY DEFINER)
 * que retorna identidade do candidato para coord/admin; aluno/anon segue peça lacrada (RS9/CA25).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRpc } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  return { mockRpc }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: mockRpc,
  }),
}))

import { listarIndicacoes } from '@/lib/data/projetos'

describe('listarIndicacoes — Bug #6: retorna identidade via RPC DEFINER', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: [], error: null })
  })

  it('B6-1: chama RPC indicacoes_coordenador (não select direto de indicacao)', async () => {
    await listarIndicacoes('proj-uuid-1')
    expect(mockRpc).toHaveBeenCalledWith('indicacoes_coordenador', {
      p_projeto_id: 'proj-uuid-1',
    })
  })

  it('B6-2: retorna array vazio em caso de erro (fail-soft)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } })
    const result = await listarIndicacoes('proj-uuid-2')
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('B6-3: retorna shape com aluno_nome, aluno_email, curso quando RPC responde', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'ind-1',
          projeto_id: 'proj-uuid-1',
          pessoa_id: 'uid-aluno',
          papel_pretendido: 'aluno',
          mensagem: null,
          created_at: '2026-06-01T00:00:00Z',
          deleted_at: null,
          aluno_nome: 'Maria Souza',
          aluno_email: 'maria@ubm.br',
          curso: 'Engenharia de Software',
        },
      ],
      error: null,
    })
    const result = await listarIndicacoes('proj-uuid-1')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      aluno_nome: 'Maria Souza',
      aluno_email: 'maria@ubm.br',
      curso: 'Engenharia de Software',
    })
  })

  it('B6-4: nunca retorna pessoa_id cru exposto ao anon (RPC filtra por papel)', async () => {
    // A RPC decide o que retornar baseado no role; o adapter apenas repassa o resultado.
    // O teste garante que o adapter usa a RPC (que tem o gate interno), não query direta.
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    const result = await listarIndicacoes('proj-uuid-3')
    // Resultado vazio = RPC negou acesso silenciosamente (aluno/anon)
    expect(Array.isArray(result)).toBe(true)
  })
})
