/**
 * T-O2.2 — TDD RED: testa as actions fecharEquipe / trocarHost
 * antes de existirem em workspace/src/lib/actions/equipe.ts
 *
 * Padrão: vi.mock('@/lib/supabase/server') + mockRpc.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRpc } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  return { mockRpc }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: mockRpc,
  }),
}))

import { fecharEquipe, trocarHost } from '@/lib/actions/equipe'

const MEMBROS_INPUT = [
  { pessoaId: 'pessoa-1', papelProjeto: 'host' as const, indicacaoId: 'ind-1' },
  { pessoaId: 'pessoa-2', papelProjeto: 'co_coordenador' as const, indicacaoId: 'ind-2' },
  { pessoaId: 'pessoa-3', papelProjeto: 'aluno' as const, indicacaoId: 'ind-3' },
]

describe('fecharEquipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('retorna ok:true quando RPC tem sucesso', async () => {
    const result = await fecharEquipe('projeto-1', 'pessoa-1', MEMBROS_INPUT)
    expect(result.ok).toBe(true)
  })

  it('chama fechar_equipe com o nome correto da RPC', async () => {
    await fecharEquipe('projeto-1', 'pessoa-1', MEMBROS_INPUT)
    expect(mockRpc).toHaveBeenCalledWith('fechar_equipe', expect.any(Object))
  })

  it('passa p_projeto_id e p_host_pessoa_id corretos', async () => {
    await fecharEquipe('proj-abc', 'host-xyz', MEMBROS_INPUT)
    const call = mockRpc.mock.calls[0]
    expect(call[1]).toMatchObject({
      p_projeto_id: 'proj-abc',
      p_host_pessoa_id: 'host-xyz',
    })
  })

  it('monta p_membros como array JSON com chaves snake_case', async () => {
    await fecharEquipe('projeto-1', 'pessoa-1', MEMBROS_INPUT)
    const call = mockRpc.mock.calls[0]
    const membrosJson = call[1].p_membros
    // deve ser array (será serializado como JSONB pelo Supabase)
    expect(Array.isArray(membrosJson)).toBe(true)
    expect(membrosJson).toHaveLength(3)
    // chaves snake_case
    expect(membrosJson[0]).toMatchObject({
      pessoa_id: 'pessoa-1',
      papel_projeto: 'host',
      indicacao_id: 'ind-1',
    })
    expect(membrosJson[1]).toMatchObject({
      pessoa_id: 'pessoa-2',
      papel_projeto: 'co_coordenador',
      indicacao_id: 'ind-2',
    })
  })

  it('p_membros sem indicacao_id usa null', async () => {
    const membros = [
      { pessoaId: 'pessoa-1', papelProjeto: 'host' as const },
    ]
    await fecharEquipe('projeto-1', 'pessoa-1', membros)
    const call = mockRpc.mock.calls[0]
    expect(call[1].p_membros[0].indicacao_id).toBeNull()
  })

  it('mapeia erro "escolha exatamente um host" para PT-BR (CA11)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'exatamente um host obrigatorio' },
    })
    const result = await fecharEquipe('projeto-1', 'pessoa-1', MEMBROS_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/host/i)
    }
  })

  it('mapeia erro "host deve ser coordenador indicado" para PT-BR (CA11)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'host deve ser coordenador com indicacao ativa' },
    })
    const result = await fecharEquipe('projeto-1', 'pessoa-1', MEMBROS_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/coordenador|indicad/i)
    }
  })

  it('mapeia erro "já existe host" (unique violation) para PT-BR (CA12)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "uq_um_host_por_projeto"' },
    })
    const result = await fecharEquipe('projeto-1', 'pessoa-1', MEMBROS_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/host/i)
    }
  })

  it('mapeia erro de permissão (coord/aluno tentando fechar) para PT-BR (CA9)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied — is_admin required' },
    })
    const result = await fecharEquipe('projeto-1', 'pessoa-1', MEMBROS_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão|admin/i)
    }
  })

  it('mapeia erro "janela fechada" (status fora de em_analise) para PT-BR (RN9)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'projeto nao esta em_analise' },
    })
    const result = await fecharEquipe('projeto-1', 'pessoa-1', MEMBROS_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/analise|período|janela/i)
    }
  })
})

describe('trocarHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('retorna ok:true quando RPC tem sucesso', async () => {
    const result = await trocarHost('projeto-1', 'novo-host-1')
    expect(result.ok).toBe(true)
  })

  it('chama trocar_host com params corretos', async () => {
    await trocarHost('proj-abc', 'host-novo')
    expect(mockRpc).toHaveBeenCalledWith('trocar_host', {
      p_projeto_id: 'proj-abc',
      p_novo_host_pessoa_id: 'host-novo',
    })
  })

  it('mapeia erro de permissão (CA13 — só admin troca host)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied — is_admin required' },
    })
    const result = await trocarHost('projeto-1', 'novo-host')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão|admin/i)
    }
  })

  it('mapeia erro "já existe host" (unique constraint) para PT-BR', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "uq_um_host_por_projeto"' },
    })
    const result = await trocarHost('projeto-1', 'novo-host')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/host/i)
    }
  })

  it('mapeia erro "novo host não é coordenador indicado" para PT-BR', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'novo host deve ser coordenador com indicacao ativa' },
    })
    const result = await trocarHost('projeto-1', 'novo-host')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/coordenador|indicad/i)
    }
  })
})
