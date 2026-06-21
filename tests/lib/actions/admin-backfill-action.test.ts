/**
 * tests/lib/actions/admin-backfill-action.test.ts
 *
 * TDD — fixarGrupo: verifica revalidatePath após sucesso.
 * Padrão: vi.hoisted + vi.mock('@/lib/supabase/server') + vi.mock('next/cache').
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

import { fixarGrupo } from '@/lib/actions/admin-backfill'

describe('fixarGrupo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ error: null })
  })

  it('chama RPC aplicar_backfill_grupo com p_grupo_id e p_canonico_id', async () => {
    await fixarGrupo('grupo-1', 'canonico-uuid')
    expect(mockRpc).toHaveBeenCalledWith('aplicar_backfill_grupo', {
      p_grupo_id: 'grupo-1',
      p_canonico_id: 'canonico-uuid',
    })
  })

  it('passa p_canonico_id=null quando canonicoId não fornecido', async () => {
    await fixarGrupo('grupo-2')
    expect(mockRpc).toHaveBeenCalledWith('aplicar_backfill_grupo', {
      p_grupo_id: 'grupo-2',
      p_canonico_id: null,
    })
  })

  it('retorna { ok: true } quando RPC tem sucesso', async () => {
    const result = await fixarGrupo('grupo-3')
    expect(result.ok).toBe(true)
  })

  it('retorna { ok: false } quando RPC retorna erro', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'apenas admin' } })
    const result = await fixarGrupo('grupo-4')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('chama revalidatePath /admin/backfill e /admin/empresas após sucesso', async () => {
    await fixarGrupo('grupo-5')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/backfill')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/empresas')
  })

  it('NÃO chama revalidatePath quando RPC falha', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'erro' } })
    await fixarGrupo('grupo-6')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
