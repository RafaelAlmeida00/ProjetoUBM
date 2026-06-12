/**
 * TDD RED — atualizarPerfil Server Action
 * Atualiza nome_publico / ranking_optin na tabela perfil sob RLS perfil_update.
 * Sem RPC; DML direto via from('perfil').update(...).eq('user_id', uid).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks Supabase ─────────────────────────────────────────────────────────────
const { mockEq, mockUpdate, mockFrom, mockGetUser } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ error: null })
  const mockUpdate = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ update: mockUpdate }))
  const mockGetUser = vi.fn().mockResolvedValue({
    data: { user: { id: 'uid-abc' } },
    error: null,
  })
  return { mockEq, mockUpdate, mockFrom, mockGetUser }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// ── Import DEPOIS dos mocks ────────────────────────────────────────────────────
import { atualizarPerfil } from '@/lib/actions/perfil'

describe('atualizarPerfil', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ update: mockUpdate })
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'uid-abc' } },
      error: null,
    })
  })

  it('retorna ok:true quando update tem sucesso', async () => {
    const result = await atualizarPerfil({ nomePublico: 'João Silva' })
    expect(result.ok).toBe(true)
  })

  it('atualiza perfil na tabela perfil com nome_publico trimado', async () => {
    await atualizarPerfil({ nomePublico: '  Ana Lima  ' })
    expect(mockFrom).toHaveBeenCalledWith('perfil')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ nome_publico: 'Ana Lima' }),
    )
    expect(mockEq).toHaveBeenCalledWith('user_id', 'uid-abc')
  })

  it('nome vazio retorna ok:false SEM chamar update', async () => {
    const result = await atualizarPerfil({ nomePublico: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/pelo menos 2/i)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('nome com apenas 1 caractere retorna ok:false SEM chamar update', async () => {
    const result = await atualizarPerfil({ nomePublico: 'X' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/pelo menos 2/i)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('nome com apenas espaços retorna ok:false SEM chamar update', async () => {
    const result = await atualizarPerfil({ nomePublico: '   ' })
    expect(result.ok).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('sem sessão retorna ok:false com mensagem de sessão', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const result = await atualizarPerfil({ nomePublico: 'Nome Válido' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/sessão/i)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('propaga rankingOptin quando fornecido', async () => {
    await atualizarPerfil({ nomePublico: 'Maria', rankingOptin: true })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ nome_publico: 'Maria', ranking_optin: true }),
    )
  })

  it('omite ranking_optin quando rankingOptin não fornecido', async () => {
    await atualizarPerfil({ nomePublico: 'Carlos' })
    const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('ranking_optin')
  })

  it('mapeia erro PostgREST de permissão para mensagem PT-BR', async () => {
    mockEq.mockResolvedValueOnce({
      error: { message: 'permission denied for table perfil' },
    })
    const result = await atualizarPerfil({ nomePublico: 'Teste' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/permissão|autorizado/i)
  })

  it('mapeia erro PostgREST genérico para mensagem PT-BR amigável', async () => {
    mockEq.mockResolvedValueOnce({
      error: { message: 'some unexpected db error' },
    })
    const result = await atualizarPerfil({ nomePublico: 'Teste' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })
})
