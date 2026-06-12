/**
 * T-O2.3 — TDD RED: testa as actions avancarProjeto / overrideTransicao /
 * arquivarProjeto / restaurarProjeto antes de existirem em
 * workspace/src/lib/actions/projeto.ts
 *
 * Padrão: vi.mock('@/lib/supabase/server') + mockRpc + mockFrom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRpc, mockFrom, mockUpdate, mockEq } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ error: null })
  const mockUpdate = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ update: mockUpdate }))
  const mockRpc = vi.fn()
  return { mockRpc, mockFrom, mockUpdate, mockEq }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: mockRpc,
    from: mockFrom,
  }),
}))

import {
  avancarProjeto,
  overrideTransicao,
  arquivarProjeto,
  restaurarProjeto,
} from '@/lib/actions/projeto'

describe('avancarProjeto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('retorna ok:true quando RPC tem sucesso', async () => {
    const result = await avancarProjeto('projeto-1')
    expect(result.ok).toBe(true)
  })

  it('chama avancar_projeto com p_projeto_id correto', async () => {
    await avancarProjeto('proj-abc')
    expect(mockRpc).toHaveBeenCalledWith('avancar_projeto', {
      p_projeto_id: 'proj-abc',
    })
  })

  it('mapeia erro "só host pode avançar" para PT-BR (CA14)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'apenas o host pode avancar o projeto' },
    })
    const result = await avancarProjeto('projeto-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/host/i)
    }
  })

  it('mapeia erro de guarda (transição inválida) para PT-BR (CA15)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'transicao nao permitida de aguardando_proposta' },
    })
    const result = await avancarProjeto('projeto-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/transição|estado/i)
    }
  })

  it('mapeia erro de permissão (co/aluno) para PT-BR', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for function avancar_projeto' },
    })
    const result = await avancarProjeto('projeto-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão/i)
    }
  })
})

describe('overrideTransicao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('retorna ok:true quando RPC tem sucesso', async () => {
    const result = await overrideTransicao('projeto-1', 'em_analise', 'Reverter por erro admin')
    expect(result.ok).toBe(true)
  })

  it('chama override_transicao com params corretos', async () => {
    await overrideTransicao('proj-abc', 'aprovado', 'Correção manual do admin')
    expect(mockRpc).toHaveBeenCalledWith('override_transicao', {
      p_projeto_id: 'proj-abc',
      p_novo_status: 'aprovado',
      p_motivo: 'Correção manual do admin',
    })
  })

  it('motivo obrigatório — recusa string vazia no client antes de chamar RPC', async () => {
    const result = await overrideTransicao('projeto-1', 'em_analise', '')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/motivo/i)
    }
    // RPC não deve ser chamada quando motivo vazio
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('motivo obrigatório — recusa string só espaços no client', async () => {
    const result = await overrideTransicao('projeto-1', 'em_analise', '   ')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/motivo/i)
    }
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('mapeia erro de permissão (só admin) para PT-BR (CA18)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied — is_admin required' },
    })
    const result = await overrideTransicao('projeto-1', 'aprovado', 'Motivo válido')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão|admin/i)
    }
  })
})

describe('arquivarProjeto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ update: mockUpdate })
  })

  it('retorna ok:true quando soft-delete tem sucesso', async () => {
    const result = await arquivarProjeto('projeto-1')
    expect(result.ok).toBe(true)
  })

  it('realiza soft-delete na tabela projeto', async () => {
    await arquivarProjeto('proj-abc')
    expect(mockFrom).toHaveBeenCalledWith('projeto')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    )
    expect(mockEq).toHaveBeenCalledWith('id', 'proj-abc')
  })

  it('mapeia erro de permissão (só admin arquiva) para PT-BR (CA19)', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'permission denied for table projeto' } })
    const result = await arquivarProjeto('projeto-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão/i)
    }
  })

  it('mapeia erro genérico de arquivamento para PT-BR', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'unknown db error' } })
    const result = await arquivarProjeto('projeto-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
    }
  })
})

describe('restaurarProjeto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('retorna ok:true quando RPC tem sucesso', async () => {
    const result = await restaurarProjeto('projeto-1')
    expect(result.ok).toBe(true)
  })

  it('chama restore_record com tabela=projeto e id correto', async () => {
    await restaurarProjeto('proj-abc')
    expect(mockRpc).toHaveBeenCalledWith('restore_record', {
      p_tabela: 'projeto',
      p_id: 'proj-abc',
    })
  })

  it('mapeia erro de permissão (só admin restaura) para PT-BR', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied — is_admin required' },
    })
    const result = await restaurarProjeto('projeto-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão|admin/i)
    }
  })

  it('mapeia erro "tabela não permitida" (allowlist) para PT-BR', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'tabela nao permitida para restore' },
    })
    const result = await restaurarProjeto('projeto-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.error).toBe('string')
    }
  })
})
