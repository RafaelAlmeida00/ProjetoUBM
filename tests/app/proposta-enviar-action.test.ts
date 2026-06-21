/**
 * T4.2 — Server Action enviarProposta (Caminho A)
 * RED: arquivo lib/actions/proposta.ts não existe → testes falham.
 * GREEN: implementar a action com upload + gateway + RPC + revalidatePath.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── mocks hoisted ──────────────────────────────────────────────────────────────
const {
  rpcMock,
  storageMock,
  uploadMock,
  criarPedidoMock,
  revalidateMock,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  storageMock: vi.fn(),
  uploadMock: vi.fn(),
  criarPedidoMock: vi.fn(),
  revalidateMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: rpcMock,
    storage: { from: storageMock },
  }),
}))

vi.mock('@/lib/signature/gateway', () => ({
  getSignatureGateway: vi.fn().mockReturnValue({
    _isFake: true,
    criarPedido: criarPedidoMock,
    cancelarPedido: vi.fn().mockResolvedValue(undefined),
    baixarProvaAssinada: vi.fn(),
  }),
}))

import { enviarProposta } from '@/lib/actions/proposta'

// Helper: cria um File-like PDF
function makePdf(sizeBytes = 1024): File {
  const buf = new Uint8Array(sizeBytes)
  return new File([buf], 'proposta.pdf', { type: 'application/pdf' })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Upload retorna sem erro
  uploadMock.mockResolvedValue({ data: { path: 'propostas/proj-1/uuid-original.pdf' }, error: null })
  storageMock.mockReturnValue({ upload: uploadMock })
  // Gateway retorna provedor_doc_id + link
  criarPedidoMock.mockResolvedValue({
    provedor_doc_id: 'aut-doc-123',
    link_assinatura: 'https://aut/sign/aut-doc-123',
    clausulaAceiteMeioEletronico: true,
    signatarios: [{ email: 'rep@empresa.com' }],
  })
  // RPC: obter_signatario_proposta devolve o representante; demais sem erro
  rpcMock.mockImplementation(async (name: string) => {
    if (name === 'obter_signatario_proposta') {
      return { data: [{ nome: 'Rep Silva', email: 'rep@empresa.com' }], error: null }
    }
    return { data: null, error: null }
  })
})

describe('enviarProposta — T4.2 (Caminho A)', () => {
  it('retorna ok:true quando upload + gateway + RPC todos ok', async () => {
    const result = await enviarProposta({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      signatario: { nome: 'Rep', email: 'rep@empresa.com' },
      pdf: makePdf(),
    })
    expect(result.ok).toBe(true)
  })

  it('chama gateway.criarPedido com o representante como único signatário (CA9)', async () => {
    await enviarProposta({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      signatario: { nome: 'Rep Silva', email: 'rep@empresa.com' },
      pdf: makePdf(),
    })
    expect(criarPedidoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signatario: expect.objectContaining({ email: 'rep@empresa.com' }),
        clausulaAceiteMeioEletronico: true,
      }),
    )
  })

  it('chama RPC enviar_proposta com p_projeto_id e p_storage_path', async () => {
    await enviarProposta({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      signatario: { nome: 'Rep', email: 'rep@empresa.com' },
      pdf: makePdf(),
    })
    expect(rpcMock).toHaveBeenCalledWith(
      'enviar_proposta',
      expect.objectContaining({
        p_projeto_id: 'proj-1',
        p_storage_path: expect.any(String),
        p_origem: 'autentique',
        p_provedor_doc_id: 'aut-doc-123',
      }),
    )
  })

  it('busca o signatário no banco e passa o representante ao gateway', async () => {
    await enviarProposta({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      signatario: { nome: '', email: '' }, // props vazias: a action resolve pelo banco
      pdf: makePdf(),
    })
    expect(rpcMock).toHaveBeenCalledWith('obter_signatario_proposta', { p_projeto_id: 'proj-1' })
    expect(criarPedidoMock).toHaveBeenCalledWith(
      expect.objectContaining({ signatario: expect.objectContaining({ email: 'rep@empresa.com' }) }),
    )
  })

  it('retorna ok:false quando não há e-mail de representante', async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === 'obter_signatario_proposta') return { data: [], error: null }
      return { data: null, error: null }
    })
    const result = await enviarProposta({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      signatario: { nome: '', email: '' },
      pdf: makePdf(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/representante|e-?mail/i)
  })

  it('revalida /app/dores/[id] e /app/notificacoes após sucesso', async () => {
    await enviarProposta({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      signatario: { nome: 'Rep', email: 'rep@empresa.com' },
      pdf: makePdf(),
    })
    const paths = revalidateMock.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(paths.some((p) => p.includes('dores'))).toBe(true)
    expect(paths.some((p) => p.includes('notificacoes'))).toBe(true)
  })

  it('retorna ok:false com erro PT-BR quando RPC falha', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'host nao verificado' } })
    const result = await enviarProposta({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      signatario: { nome: 'Rep', email: 'rep@empresa.com' },
      pdf: makePdf(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })

  it('rejeita arquivo não-PDF com erro (RS12)', async () => {
    const notPdf = new File([new Uint8Array(512)], 'doc.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    const result = await enviarProposta({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      signatario: { nome: 'Rep', email: 'rep@empresa.com' },
      pdf: notPdf,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/pdf/i)
  })

  it('rejeita arquivo acima de 10MB (RS12)', async () => {
    const bigPdf = makePdf(11 * 1024 * 1024)
    const result = await enviarProposta({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      signatario: { nome: 'Rep', email: 'rep@empresa.com' },
      pdf: bigPdf,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })

  it('retorna ok:false com erro PT-BR quando upload falha', async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: 'bucket full' } })
    const result = await enviarProposta({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      signatario: { nome: 'Rep', email: 'rep@empresa.com' },
      pdf: makePdf(),
    })
    expect(result.ok).toBe(false)
  })
})
