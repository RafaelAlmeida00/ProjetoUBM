/**
 * T-B-guard — Server Action: revogarAdmin
 * TDD RED: bloquear self-revoke (alvo == auth.uid()) com mensagem PT-BR.
 * Admin pode revogar OUTRO admin, mas não a si mesmo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockFrom, mockDelete, mockEq } = vi.hoisted(() => {
  const mockEq     = vi.fn()
  const mockDelete = vi.fn(() => ({ eq: mockEq }))
  const mockFrom   = vi.fn(() => ({ delete: mockDelete }))
  const mockGetUser = vi.fn()
  return { mockGetUser, mockFrom, mockDelete, mockEq }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import { revogarAdmin } from '@/lib/actions/admin-usuarios'

describe('revogarAdmin — B-guard: bloquear self-revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockResolvedValue({ error: null })
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

  it('B3: NÃO chama DELETE quando é self-revoke', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-self-uuid' } }, error: null })
    await revogarAdmin('admin-self-uuid')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('B4: permite revogar OUTRO admin (ok:true)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-self-uuid' } }, error: null })
    const result = await revogarAdmin('outro-admin-uuid')
    expect(result.ok).toBe(true)
    expect(mockDelete).toHaveBeenCalled()
  })

  it('B5: sem sessão retorna ok:false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await revogarAdmin('qualquer-uuid')
    expect(result.ok).toBe(false)
  })
})
