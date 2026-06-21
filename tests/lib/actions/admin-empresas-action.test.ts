/**
 * Fix varredura contrato — admin-empresas.ts:
 *   (a) mergeEmpresa: usa { p_id_manter, p_id_remover } mas a RPC real é merge_empresa(p_loser, p_winner)
 *   (b) desfazerMerge: usa { p_log_id } mas a RPC real é desfazer_merge(p_log uuid)
 * Ambos causariam HTTP 404 em produção.
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

import { mergeEmpresa, desfazerMerge } from '@/lib/actions/admin-empresas'

describe('mergeEmpresa', () => {
  beforeEach(() => vi.clearAllMocks())

  it('usa { p_loser, p_winner } corretos (não p_id_manter/p_id_remover) — evita HTTP 404', async () => {
    mockRpc.mockResolvedValue({ data: { log_id: 'log-1' }, error: null })
    await mergeEmpresa('uuid-loser', 'uuid-winner')
    expect(mockRpc).toHaveBeenCalledWith('merge_empresa', {
      p_loser: 'uuid-loser',
      p_winner: 'uuid-winner',
    })
  })

  it('retorna { ok: true, log_id } quando a RPC tem sucesso', async () => {
    mockRpc.mockResolvedValue({ data: { log_id: 'log-abc' }, error: null })
    const result = await mergeEmpresa('a', 'b')
    expect(result).toEqual({ ok: true, log_id: 'log-abc' })
  })

  it('retorna { ok: false } quando a RPC retorna erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'apenas admin' } })
    expect((await mergeEmpresa('a', 'b')).ok).toBe(false)
  })

  it('chama revalidatePath /admin/empresas e /app/dores layout após sucesso', async () => {
    mockRpc.mockResolvedValue({ data: { log_id: 'log-1' }, error: null })
    await mergeEmpresa('a', 'b')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/empresas')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores', 'layout')
  })

  it('NÃO chama revalidatePath quando RPC falha', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'erro' } })
    await mergeEmpresa('a', 'b')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

describe('desfazerMerge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('usa { p_log } correto (não p_log_id) — evita HTTP 404', async () => {
    mockRpc.mockResolvedValue({ error: null })
    await desfazerMerge('log-uuid-1')
    expect(mockRpc).toHaveBeenCalledWith('desfazer_merge', { p_log: 'log-uuid-1' })
  })

  it('retorna { ok: true } quando a RPC tem sucesso', async () => {
    mockRpc.mockResolvedValue({ error: null })
    expect(await desfazerMerge('log-1')).toEqual({ ok: true })
  })

  it('retorna { ok: false } quando a RPC retorna erro', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'merge nao encontrado ou ja desfeito' } })
    expect((await desfazerMerge('log-1')).ok).toBe(false)
  })

  it('chama revalidatePath /admin/empresas e /app/dores layout após sucesso', async () => {
    mockRpc.mockResolvedValue({ error: null })
    await desfazerMerge('log-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/empresas')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores', 'layout')
  })

  it('NÃO chama revalidatePath quando RPC falha', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'erro' } })
    await desfazerMerge('log-1')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
