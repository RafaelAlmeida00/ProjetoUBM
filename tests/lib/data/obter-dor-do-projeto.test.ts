/**
 * T1 (009) — obterDorDoProjeto: lookup reverso projeto→dor (forward).
 * Usado pelo redirect /app/projetos/[id]→/app/dores/[dor_id] e pelo remapeamento de
 * deep-links de notificação. Sem ORÁCULO de existência: inexistente/soft-deleted/sem-acesso
 * caem todos no mesmo caminho → null. NÃO seleciona PII.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockMaybeSingle, mockIs, mockEq, mockSelect, mockFrom } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn()
  const mockIs = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
  const mockEq = vi.fn(() => ({ is: mockIs }))
  const mockSelect = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ select: mockSelect }))
  return { mockMaybeSingle, mockIs, mockEq, mockSelect, mockFrom }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({ from: mockFrom }),
}))

import { obterDorDoProjeto } from '@/lib/data/dores'

beforeEach(() => vi.clearAllMocks())

describe('obterDorDoProjeto — projeto→dor (sem oráculo de existência)', () => {
  it('projeto visível e vivo → retorna dor_id', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { dor_id: 'dor-1' }, error: null })
    expect(await obterDorDoProjeto('proj-1')).toBe('dor-1')
    // filtra deleted_at is null (não resolve soft-deletado)
    expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
    // nunca lê perfil/PII
    expect(mockFrom).toHaveBeenCalledWith('projeto')
  })

  it('inexistente / soft-deletado / sem-acesso → null (mesmo caminho)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await obterDorDoProjeto('proj-x')).toBeNull()
  })

  it('erro de query → null (degrada, não vaza)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await obterDorDoProjeto('proj-1')).toBeNull()
  })
})
