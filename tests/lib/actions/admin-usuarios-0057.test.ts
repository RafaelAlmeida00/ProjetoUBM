/**
 * 0057 — Actions: concederCoordenador (multi-slug) + concederRepresentante (nova)
 * RED: falha até as novas assinaturas estarem implementadas.
 *
 * Contratos:
 *   concederCoordenador(userId, cursoSlugs: string[]) → rpc conceder_coordenador(p_user_id, p_curso_slugs)
 *   concederRepresentante(userId, empresaId) → rpc conceder_representante(p_user_id, p_empresa_id)
 *   concederPapel('representante') → deve ser bloqueado pelo banco (mas a UI não chama mais — apenas 'aluno')
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    rpc: mockRpc,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-uid' } }, error: null }) },
  })),
}))

import { concederCoordenador, concederRepresentante } from '@/lib/actions/admin-usuarios'

describe('concederCoordenador — 0057: aceita array de slugs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('0057-CC-1: chama rpc conceder_coordenador com p_curso_slugs (array)', async () => {
    const result = await concederCoordenador('user-123', ['direito', 'engenharia_de_software'])
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('conceder_coordenador', {
      p_user_id: 'user-123',
      p_curso_slugs: ['direito', 'engenharia_de_software'],
    })
  })

  it('0057-CC-2: funciona com array de um único slug', async () => {
    const result = await concederCoordenador('user-abc', ['direito'])
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('conceder_coordenador', {
      p_user_id: 'user-abc',
      p_curso_slugs: ['direito'],
    })
  })

  it('0057-CC-3: retorna ok:false quando rpc retorna erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Permissão negada' } })
    const result = await concederCoordenador('user-xyz', ['direito'])
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('0057-CC-4: NÃO usa p_curso_id (parâmetro antigo singular)', async () => {
    await concederCoordenador('user-999', ['administracao'])
    const rpcArgs = mockRpc.mock.calls[0]?.[1] as Record<string, unknown> | undefined
    expect(rpcArgs).toBeDefined()
    expect(rpcArgs).not.toHaveProperty('p_curso_id')
    expect(rpcArgs).toHaveProperty('p_curso_slugs')
  })
})

describe('concederRepresentante — 0057: nova action com empresa obrigatória', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('0057-CR-1: chama rpc conceder_representante com p_user_id e p_empresa_id', async () => {
    const result = await concederRepresentante('user-rep-1', 'emp-uuid-1')
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('conceder_representante', {
      p_user_id: 'user-rep-1',
      p_empresa_id: 'emp-uuid-1',
    })
  })

  it('0057-CR-2: retorna ok:false quando rpc retorna erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'empresa inválida' } })
    const result = await concederRepresentante('user-rep-2', 'emp-invalida')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('0057-CR-3: função concederRepresentante é exportada', async () => {
    const mod = await import('@/lib/actions/admin-usuarios')
    expect(typeof mod.concederRepresentante).toBe('function')
  })
})
