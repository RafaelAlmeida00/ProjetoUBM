/**
 * T-X3b — FE: concederPapel chama a RPC conceder_papel em vez de insert direto.
 * RED: falha porque a implementação atual faz .from('papel_usuario').insert({ user_id, papel })
 * com coluna 'papel' inexistente (a real é 'role') e sem passar pela RPC DEFINER.
 *
 * O contrato correto:
 *   supabase.rpc('conceder_papel', { p_user_id, p_role })
 *
 * NÃO deve chamar:
 *   supabase.from('papel_usuario').insert({ user_id, papel })
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
const mockFrom = vi.fn()
const mockInsert = vi.fn()

mockFrom.mockReturnValue({ insert: mockInsert, delete: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) })
mockInsert.mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}))

import { concederPapel } from '@/lib/actions/admin-usuarios'

describe('concederPapel — T-X3b: chama RPC, não insert direto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('X3b-1: chama supabase.rpc("conceder_papel", { p_user_id, p_role })', async () => {
    const result = await concederPapel('user-uuid-1', 'representante')
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('conceder_papel', {
      p_user_id: 'user-uuid-1',
      p_role: 'representante',
    })
  })

  it('X3b-2: NÃO chama .from("papel_usuario").insert() diretamente', async () => {
    await concederPapel('user-uuid-2', 'aluno')
    // Insert direto não deve ter sido chamado com 'papel_usuario'
    const fromCalls = mockFrom.mock.calls
    const usouPapelUsuarioDireto = fromCalls.some(
      ([tabela]: [string]) => tabela === 'papel_usuario',
    )
    expect(usouPapelUsuarioDireto).toBe(false)
  })

  it('X3b-3: retorna ok:false quando a RPC retorna erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Permissão negada' } })
    const result = await concederPapel('user-uuid-3', 'coordenador')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('X3b-4: NÃO usa coluna "papel" (nome errado) — usa "p_role" como parâmetro', async () => {
    await concederPapel('user-uuid-4', 'aluno')
    const rpcArgs = mockRpc.mock.calls[0]?.[1] as Record<string, unknown> | undefined
    if (rpcArgs) {
      // Não deve ter chave 'papel' (nome de coluna errado)
      expect(rpcArgs).not.toHaveProperty('papel')
      // Deve ter p_role
      expect(rpcArgs).toHaveProperty('p_role')
    }
  })
})
