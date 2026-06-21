/**
 * T-B-guard — Server Action: revogarAdmin
 * Guard de self-revoke: alvo == auth.uid() → bloqueado antes de ir ao banco.
 * Admin pode revogar OUTRO admin via RPC revogar_admin (0055).
 * Migrado: action não faz mais delete direto — usa rpc('revogar_admin').
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockRpc } = vi.hoisted(() => {
  const mockRpc     = vi.fn().mockResolvedValue({ error: null })
  const mockGetUser = vi.fn()
  return { mockGetUser, mockRpc }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revogarAdmin } from '@/lib/actions/admin-usuarios'

describe('revogarAdmin — B-guard: bloquear self-revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ error: null })
  })

  it('B1: retorna ok:false quando userId == sessão atual (self-revoke bloqueado)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-self-uuid' } }, error: null })
    const result = await revogarAdmin('admin-self-uuid')
    expect(result.ok).toBe(false)
  })

  it('B2: mensagem PT-BR menciona "próprio acesso" ou similar ao bloquear self-revoke', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-self-uuid' } }, error: null })
    const result = await revogarAdmin('admin-self-uuid')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/próprio|seu acesso|si mesmo/i)
    }
  })

  it('B3: NÃO chama RPC quando é self-revoke (pre-check UX)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-self-uuid' } }, error: null })
    await revogarAdmin('admin-self-uuid')
    // A action retorna cedo sem chamar a RPC para self-revoke
    expect(mockRpc).not.toHaveBeenCalledWith('revogar_admin', expect.anything())
  })

  it('B4: permite revogar OUTRO admin chamando rpc revogar_admin (ok:true)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-self-uuid' } }, error: null })
    const result = await revogarAdmin('outro-admin-uuid')
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('revogar_admin', { p_user_id: 'outro-admin-uuid' })
  })

  it('B5: sem sessão retorna ok:false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await revogarAdmin('qualquer-uuid')
    expect(result.ok).toBe(false)
  })
})
