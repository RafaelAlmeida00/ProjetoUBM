/**
 * T-AN14 — contrato da Server Action reclamarDor contra o contrato real da RPC (0042).
 *
 * Contrato novo (migração 0042): reclamar_dor(p_dor_id, p_token, p_empresa_id default null)
 * A vinculação da empresa agora é feita DENTRO da RPC, após a prova de posse por token
 * (achado HIGH de security review: mutate-before-authorize eliminado).
 * O update prévio `dor.empresa_id` foi REMOVIDO — nunca deve aparecer nesta action.
 *
 * Cobre:
 * - RPC chamada com p_token + p_empresa_id (ou null) — não há .from('dor').update() na action
 * - token invalido → ok: false (CA28: fallback)
 * - token expirado → ok: false (fallback)
 * - dor sem token de claim (órfã legada) → ok: false
 * - dor ja reclamada por outro usuario → ok: false (fallback)
 * - re-claim pelo mesmo uid (idempotência) → ok: true (no-op silencioso)
 * - dorId inválido → ok: false
 * - empresa nao encontrada: p_empresa_id invalido (0041) → ok: false (CA28)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockRpc, mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
    from: mockFrom,
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
  headers: vi.fn().mockResolvedValue({ get: () => null }),
}))

// ── Import após mocks ──────────────────────────────────────────────────────

import { reclamarDor } from '@/lib/actions/dor'
import { limparStore } from '@/lib/actions/rate-limit'

// ── Testes: mapeamento de erros da RPC ─────────────────────────────────────

describe('reclamarDor — mapeamento de erros da RPC (T-AN14/contrato T-AN5/0042)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    limparStore()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null })
    mockRpc.mockResolvedValue({ error: null })
  })

  it('RD-1: sucesso → ok: true', async () => {
    mockRpc.mockResolvedValue({ error: null })
    const result = await reclamarDor('dor-001', 'token-valido')
    expect(result.ok).toBe(true)
  })

  it('RD-2: erro "token invalido" → ok: false (CA28 — fallback, não quebra)', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'token invalido: claim negado' } })
    const result = await reclamarDor('dor-001', 'token-ruim')
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBeTruthy()
  })

  it('RD-3: erro "dor ja reclamada por outro usuario" → ok: false (CA28)', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'dor ja reclamada por outro usuario' } })
    const result = await reclamarDor('dor-001', 'token-valido')
    expect(result.ok).toBe(false)
  })

  it('RD-4: erro "dor nao encontrada ou ja deletada" → ok: false', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'dor nao encontrada ou ja deletada' } })
    const result = await reclamarDor('dor-001', 'token-valido')
    expect(result.ok).toBe(false)
  })

  it('RD-5: erro "token expirado: claim negado" → ok: false com mensagem PT-BR', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'token expirado: claim negado (SR-B7)' } })
    const result = await reclamarDor('dor-001', 'token-expirado')
    expect(result.ok).toBe(false)
    const err = (result as { ok: false; error: string }).error
    expect(err).toMatch(/expirado|inválido/i)
  })

  it('RD-6: re-claim pelo mesmo uid (no-op) → ok: true (idempotência da RPC)', async () => {
    mockRpc.mockResolvedValue({ error: null })
    const r1 = await reclamarDor('dor-001', 'token-valido')
    const r2 = await reclamarDor('dor-001', 'token-valido')
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
  })

  it('RD-11: erro "empresa nao encontrada: p_empresa_id invalido (0041)" → ok: false (CA28)', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'empresa nao encontrada: p_empresa_id invalido (0041)' } })
    const result = await reclamarDor('dor-001', 'token-valido', 'emp-invalido')
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBeTruthy()
  })
})

// ── Testes: contrato novo — p_token + p_empresa_id na RPC, ZERO update prévio ──

describe('reclamarDor — contrato 0042: p_token + p_empresa_id na RPC, sem update prévio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    limparStore()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null })
    mockRpc.mockResolvedValue({ error: null })
  })

  it('RD-7: sem empresaId → RPC chamada com p_token e p_empresa_id: null; ZERO .from().update()', async () => {
    await reclamarDor('dor-001', 'token-valido')
    // Contrato 0042: p_token obrigatório, p_empresa_id null quando ausente
    expect(mockRpc).toHaveBeenCalledWith('reclamar_dor', {
      p_dor_id: 'dor-001',
      p_token: 'token-valido',
      p_empresa_id: null,
    })
    // HARD: nenhum update prévio — mutate-before-authorize eliminado (achado HIGH)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('RD-8: com empresaId → RPC chamada com p_token + p_empresa_id preenchido; ZERO .from().update()', async () => {
    await reclamarDor('dor-001', 'token-valido', 'emp-42')
    // A empresa é vinculada DENTRO da RPC, após a prova de posse por token (0042)
    expect(mockRpc).toHaveBeenCalledWith('reclamar_dor', {
      p_dor_id: 'dor-001',
      p_token: 'token-valido',
      p_empresa_id: 'emp-42',
    })
    // HARD: nenhum update prévio — a RLS real silenciava o update (achado HIGH)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('RD-9: empresaId presente e RPC falha → ok: false', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'empresa nao encontrada: p_empresa_id invalido (0041)' } })
    const result = await reclamarDor('dor-001', 'token-valido', 'emp-inexistente')
    expect(result.ok).toBe(false)
    // HARD: from() nunca é chamado, mesmo com erro
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('RD-10: RPC com p_token + p_empresa_id é a única chamada ao supabase (sem etapas adicionais)', async () => {
    const calls: string[] = []
    mockRpc.mockImplementation(async () => { calls.push('rpc'); return { error: null } })
    mockFrom.mockImplementation(() => { calls.push('from'); return {} })

    await reclamarDor('dor-001', 'token-valido', 'emp-42')
    // Deve conter exatamente 'rpc' e nunca 'from'
    expect(calls).toEqual(['rpc'])
    expect(calls).not.toContain('from')
  })
})
