/**
 * T-O2.1 — TDD RED: testa as actions indicarSe / retirarIndicacao
 * antes de existirem em workspace/src/lib/actions/indicacao.ts
 *
 * Espelha o padrão de submeter-dor-landing.test.ts:
 *   vi.mock('@/lib/supabase/server') + mockRpc + asserções PT-BR.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRpc, mockRevalidatePath } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  const mockRevalidatePath = vi.fn()
  return { mockRpc, mockRevalidatePath }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: mockRpc,
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

import { indicarSe, retirarIndicacao } from '@/lib/actions/indicacao'

describe('indicarSe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('chama revalidatePath em /app/dores, /app/dores layout e /app ao ter sucesso', async () => {
    await indicarSe('projeto-1', 'aluno')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores', 'layout')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app', 'page')
  })

  it('NÃO chama revalidatePath quando RPC falha', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'conta nao verificada' } })
    await indicarSe('projeto-1', 'aluno')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('retorna ok:true quando RPC tem sucesso', async () => {
    const result = await indicarSe('projeto-1', 'aluno')
    expect(result.ok).toBe(true)
  })

  it('chama indicar_se com params corretos (sem mensagem)', async () => {
    await indicarSe('projeto-1', 'coordenador')
    expect(mockRpc).toHaveBeenCalledWith('indicar_se', {
      p_projeto_id: 'projeto-1',
      p_papel_pretendido: 'coordenador',
      p_mensagem: null,
    })
  })

  it('chama indicar_se com mensagem quando fornecida', async () => {
    await indicarSe('projeto-1', 'aluno', 'Quero contribuir com o projeto')
    expect(mockRpc).toHaveBeenCalledWith('indicar_se', {
      p_projeto_id: 'projeto-1',
      p_papel_pretendido: 'aluno',
      p_mensagem: 'Quero contribuir com o projeto',
    })
  })

  it('mapeia erro "conta não verificada" para PT-BR (RN8)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'conta nao verificada' },
    })
    const result = await indicarSe('projeto-1', 'aluno')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/verificad/i)
    }
  })

  it('mapeia erro "projeto fora de em_analise" para PT-BR (RN9)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'projeto nao esta em_analise' },
    })
    const result = await indicarSe('projeto-1', 'aluno')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/indicaç|período|aberta/i)
    }
  })

  it('mapeia erro "2ª indicação ativa" (unique violation) para PT-BR (RN7)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "uq_indicacao_pessoa_projeto"' },
    })
    const result = await indicarSe('projeto-1', 'aluno')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/já.*indicad|indicaç.*ativa/i)
    }
  })

  it('mapeia erro genérico de RPC', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'internal server error' },
    })
    const result = await indicarSe('projeto-1', 'aluno')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
    }
  })
})

describe('retirarIndicacao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('chama revalidatePath em /app/dores, /app/dores layout e /app ao ter sucesso', async () => {
    await retirarIndicacao('projeto-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores', 'layout')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app', 'page')
  })

  it('NÃO chama revalidatePath quando RPC falha', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'indicacao nao encontrada' } })
    await retirarIndicacao('projeto-1')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('retorna ok:true quando RPC tem sucesso', async () => {
    const result = await retirarIndicacao('projeto-1')
    expect(result.ok).toBe(true)
  })

  it('chama retirar_indicacao com projeto_id correto', async () => {
    await retirarIndicacao('projeto-abc')
    expect(mockRpc).toHaveBeenCalledWith('retirar_indicacao', {
      p_projeto_id: 'projeto-abc',
    })
  })

  it('retorna ok:false e mensagem PT-BR quando RPC falha', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'indicacao nao encontrada' },
    })
    const result = await retirarIndicacao('projeto-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.error).toBe('string')
    }
  })

  it('retorna ok:false em erro de permissão', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for table indicacao' },
    })
    const result = await retirarIndicacao('projeto-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão/i)
    }
  })
})
