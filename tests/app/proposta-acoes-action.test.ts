/**
 * T4.4 — Server Actions contrapropor + iniciarExecucao + finalizarProjeto
 * RED: actions não existem → testes falham.
 * GREEN: implementar wrappers → RPCs + revalidatePath; contrapropor cancela no gateway quando origem=autentique.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  rpcMock,
  cancelarPedidoMock,
  revalidateMock,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  cancelarPedidoMock: vi.fn(),
  revalidateMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: rpcMock,
  }),
}))

vi.mock('@/lib/signature/gateway', () => ({
  getSignatureGateway: vi.fn().mockReturnValue({
    _isFake: true,
    criarPedido: vi.fn(),
    cancelarPedido: cancelarPedidoMock,
    baixarProvaAssinada: vi.fn(),
  }),
}))

import { contrapropor, iniciarExecucao, finalizarProjeto } from '@/lib/actions/proposta'

beforeEach(() => {
  vi.clearAllMocks()
  rpcMock.mockResolvedValue({ data: null, error: null })
  cancelarPedidoMock.mockResolvedValue(undefined)
})

// ── contrapropor ─────────────────────────────────────────────────────────────

describe('contrapropor — T4.4', () => {
  it('retorna ok:true quando RPC ok', async () => {
    const result = await contrapropor({
      projetoId: 'proj-1',
      motivo: 'Escopo mal definido',
    })
    expect(result.ok).toBe(true)
  })

  it('chama RPC contrapropor_proposta com p_projeto_id e p_motivo', async () => {
    await contrapropor({ projetoId: 'proj-1', motivo: 'Escopo mal definido' })
    expect(rpcMock).toHaveBeenCalledWith(
      'contrapropor_proposta',
      expect.objectContaining({
        p_projeto_id: 'proj-1',
        p_motivo: 'Escopo mal definido',
      }),
    )
  })

  it('revalida /app/dores e /app/notificacoes após sucesso', async () => {
    await contrapropor({ projetoId: 'proj-1', motivo: 'Motivo qualquer' })
    const paths = revalidateMock.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(paths.some((p) => p.includes('dores'))).toBe(true)
    expect(paths.some((p) => p.includes('notificacoes'))).toBe(true)
  })

  it('cancela pedido no gateway quando origem=autentique (CA12)', async () => {
    await contrapropor({
      projetoId: 'proj-1',
      motivo: 'Escopo',
      provedorDocId: 'aut-doc-123',
      origem: 'autentique',
    })
    expect(cancelarPedidoMock).toHaveBeenCalledWith('aut-doc-123')
  })

  it('NÃO cancela no gateway quando origem=upload_livre', async () => {
    await contrapropor({
      projetoId: 'proj-1',
      motivo: 'Escopo',
      provedorDocId: undefined,
      origem: 'upload_livre',
    })
    expect(cancelarPedidoMock).not.toHaveBeenCalled()
  })

  it('NÃO cancela no gateway quando sem provedorDocId (Caminho B ou sem envio externo)', async () => {
    await contrapropor({ projetoId: 'proj-1', motivo: 'Escopo' })
    expect(cancelarPedidoMock).not.toHaveBeenCalled()
  })

  it('retorna ok:false com erro PT-BR quando RPC falha', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'motivo obrigatorio' } })
    const result = await contrapropor({ projetoId: 'proj-1', motivo: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })
})

// ── iniciarExecucao ──────────────────────────────────────────────────────────

describe('iniciarExecucao — T4.4', () => {
  it('retorna ok:true quando RPC ok', async () => {
    const result = await iniciarExecucao('proj-1')
    expect(result.ok).toBe(true)
  })

  it('chama RPC iniciar_execucao com p_projeto_id', async () => {
    await iniciarExecucao('proj-1')
    expect(rpcMock).toHaveBeenCalledWith(
      'iniciar_execucao',
      expect.objectContaining({ p_projeto_id: 'proj-1' }),
    )
  })

  it('revalida paths após sucesso', async () => {
    await iniciarExecucao('proj-1')
    expect(revalidateMock).toHaveBeenCalled()
  })

  it('retorna ok:false com erro PT-BR quando RPC falha', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'proposta nao aprovada' } })
    const result = await iniciarExecucao('proj-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })
})

// ── finalizarProjeto ─────────────────────────────────────────────────────────

describe('finalizarProjeto — T4.4', () => {
  it('retorna ok:true quando RPC ok', async () => {
    const result = await finalizarProjeto('proj-1')
    expect(result.ok).toBe(true)
  })

  it('chama RPC finalizar_projeto com p_projeto_id', async () => {
    await finalizarProjeto('proj-1')
    expect(rpcMock).toHaveBeenCalledWith(
      'finalizar_projeto',
      expect.objectContaining({ p_projeto_id: 'proj-1' }),
    )
  })

  it('revalida paths incluindo /app após sucesso', async () => {
    await finalizarProjeto('proj-1')
    const paths = revalidateMock.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(paths.some((p) => p === '/app' || p.includes('dores'))).toBe(true)
  })

  it('retorna ok:false com erro PT-BR quando RPC falha', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'projeto nao em execucao' } })
    const result = await finalizarProjeto('proj-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })
})
