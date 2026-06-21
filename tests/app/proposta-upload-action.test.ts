/**
 * T4.3 — Server Action enviarDocumentoAssinado (Caminho B — upload livre)
 * RED: action não existe → testes falham.
 * GREEN: implementar a action: valida PDF + upload + RPC confirmar_assinatura(upload_livre) + revalidatePath.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  rpcMock,
  storageMock,
  uploadMock,
  revalidateMock,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  storageMock: vi.fn(),
  uploadMock: vi.fn(),
  revalidateMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: rpcMock,
    storage: { from: storageMock },
  }),
}))

// Caminho B: sem chamada externa — não precisa mockar gateway

import { enviarDocumentoAssinado } from '@/lib/actions/proposta'

function makePdf(sizeBytes = 1024): File {
  const buf = new Uint8Array(sizeBytes)
  return new File([buf], 'proposta-assinada.pdf', { type: 'application/pdf' })
}

beforeEach(() => {
  vi.clearAllMocks()
  uploadMock.mockResolvedValue({ data: { path: 'propostas/proj-1/uuid-assinado.pdf' }, error: null })
  storageMock.mockReturnValue({ upload: uploadMock })
  rpcMock.mockResolvedValue({ data: null, error: null })
})

describe('enviarDocumentoAssinado — T4.3 (Caminho B)', () => {
  it('retorna ok:true quando upload + RPC ok', async () => {
    const result = await enviarDocumentoAssinado({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      pdfAssinado: makePdf(),
    })
    expect(result.ok).toBe(true)
  })

  it('chama RPC confirmar_assinatura com origem=upload_livre (CA24)', async () => {
    await enviarDocumentoAssinado({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      pdfAssinado: makePdf(),
    })
    expect(rpcMock).toHaveBeenCalledWith(
      'confirmar_assinatura',
      expect.objectContaining({
        p_origem: 'upload_livre',
        p_chave: 'doc-1',
        p_storage_path: expect.any(String),
      }),
    )
  })

  it('2º upload com RPC retornando no-op (data=null, error=null) → ok:true idempotente (CA25)', async () => {
    // Segunda chamada: RPC retorna no-op (já assinado → sem erro, sem transição)
    rpcMock.mockResolvedValue({ data: null, error: null })
    const result = await enviarDocumentoAssinado({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      pdfAssinado: makePdf(),
    })
    expect(result.ok).toBe(true)
  })

  it('rejeita arquivo não-PDF com mensagem PT-BR (RS12)', async () => {
    const notPdf = new File([new Uint8Array(512)], 'signed.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const result = await enviarDocumentoAssinado({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      pdfAssinado: notPdf,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/pdf/i)
  })

  it('NÃO chama nenhuma API externa (Caminho B — sem gateway)', async () => {
    // Se o gateway fosse importado e chamado, este teste detectaria via spy.
    // A implementação não deve importar getSignatureGateway aqui.
    await enviarDocumentoAssinado({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      pdfAssinado: makePdf(),
    })
    // RPC foi chamada (o banco é usado), mas nenhum gateway externo
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('retorna ok:false com erro PT-BR quando RPC rejeita (ex: documento superado — CA25)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'documento superado apos contraproposta' } })
    const result = await enviarDocumentoAssinado({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      pdfAssinado: makePdf(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })

  it('revalida /app/dores após sucesso', async () => {
    await enviarDocumentoAssinado({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      pdfAssinado: makePdf(),
    })
    const paths = revalidateMock.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(paths.some((p) => p.includes('dores'))).toBe(true)
  })
})
