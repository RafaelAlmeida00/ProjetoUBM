/**
 * Fix D4 — assumirPapel: a RPC assumir_papel(p_role app_role) usa `p_role`, não `p_papel`.
 * Com `p_papel`, PostgREST retorna HTTP 404 (sobrecarga não encontrada) → papel NUNCA criado.
 * Este teste trava o NOME do argumento (não posicional) para detectar regressão de contrato.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRpc, mockRevalidatePath } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockRevalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({ rpc: mockRpc }),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

import { assumirPapel } from '@/lib/actions/assumir-papel'

describe('assumirPapel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usa o parâmetro { p_role } correto (não p_papel) — evita HTTP 404', async () => {
    mockRpc.mockResolvedValue({ error: null })
    await assumirPapel('aluno')
    // A assinatura real da RPC é assumir_papel(p_role app_role) — não p_papel
    expect(mockRpc).toHaveBeenCalledWith('assumir_papel', { p_role: 'aluno' })
  })

  it('passa o valor do papel sem alteração para a RPC', async () => {
    mockRpc.mockResolvedValue({ error: null })
    await assumirPapel('representante')
    expect(mockRpc).toHaveBeenCalledWith('assumir_papel', { p_role: 'representante' })
  })

  it('retorna { ok: true } quando a RPC tem sucesso', async () => {
    mockRpc.mockResolvedValue({ error: null })
    expect(await assumirPapel('aluno')).toEqual({ ok: true })
  })

  it('retorna { ok: false, error } quando a RPC retorna erro', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'permission denied for function assumir_papel' } })
    const result = await assumirPapel('coordenador')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('permission denied for function assumir_papel')
  })

  it('chama revalidatePath / layout após sucesso', async () => {
    mockRpc.mockResolvedValue({ error: null })
    await assumirPapel('aluno')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('NÃO chama revalidatePath quando RPC falha', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'denied' } })
    await assumirPapel('aluno')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
