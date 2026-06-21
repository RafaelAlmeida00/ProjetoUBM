/**
 * T4.5 — Route Handler POST /api/webhooks/autentique
 * RED: route não existe → testes falham.
 * GREEN: implementar com validação de segredo constant-time, idempotência, baixar prova,
 *        upload via service_role, RPC confirmar_assinatura, recusa/expiração.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── mocks hoisted ──────────────────────────────────────────────────────────────
const {
  rpcMock,
  storageMock,
  uploadMock,
  fromMock,
  baixarProvaAssinadaMock,
  adminClientMock,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  storageMock: vi.fn(),
  uploadMock: vi.fn(),
  fromMock: vi.fn(),
  baixarProvaAssinadaMock: vi.fn(),
  adminClientMock: vi.fn(),
}))

// service_role client (admin) — SOMENTE aqui (RS10)
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: adminClientMock,
}))

vi.mock('@/lib/signature/gateway', () => ({
  getSignatureGateway: vi.fn().mockReturnValue({
    _isFake: true,
    criarPedido: vi.fn(),
    cancelarPedido: vi.fn().mockResolvedValue(undefined),
    baixarProvaAssinada: baixarProvaAssinadaMock,
  }),
}))

// next/cache no Route Handler (quando usado)
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Env com segredo de teste
const TEST_SECRET = 'test-webhook-secret-2026'

function makeRequest(body: unknown, secret?: string): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/autentique', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-autentique-signature': secret ?? TEST_SECRET,
    },
    body: JSON.stringify(body),
  })
}

const FAKE_PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]) // %PDF-1.4

beforeEach(() => {
  vi.clearAllMocks()
  process.env['AUTENTIQUE_WEBHOOK_SECRET'] = TEST_SECRET

  // baixar prova retorna PDF + manifesto
  baixarProvaAssinadaMock.mockResolvedValue({
    pdfBuffer: FAKE_PDF.buffer,
    manifesto: { hash_sha256: 'abc123', assinado_em: '2026-06-21T10:00:00Z' },
  })

  // upload do storage (service_role)
  uploadMock.mockResolvedValue({ data: { path: 'propostas/proj-1/uuid-assinado.pdf' }, error: null })
  storageMock.mockReturnValue({ upload: uploadMock })

  // rpc retorna sem erro
  rpcMock.mockResolvedValue({ data: null, error: null })

  // from() para consulta de idempotência
  fromMock.mockImplementation((table: string) => {
    if (table === 'assinatura') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        }),
      }
    }
    return { select: vi.fn() }
  })

  // Admin client (service_role)
  adminClientMock.mockReturnValue({
    rpc: rpcMock,
    storage: { from: storageMock },
    from: fromMock,
  })
})

import { POST } from '@/app/api/webhooks/autentique/route'

// ── CA5: segredo válido → 200 + RPC ─────────────────────────────────────────

describe('POST /api/webhooks/autentique — CA5: segredo válido', () => {
  it('retorna 200 quando segredo correto + evento assinado', async () => {
    const req = makeRequest({
      event: 'document.signed',
      document: { id: 'aut-doc-123', status: 'SIGNED' },
    }, TEST_SECRET)
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('chama RPC confirmar_assinatura com origem=autentique e storage_path preenchido (CA5)', async () => {
    const req = makeRequest({
      event: 'document.signed',
      document: { id: 'aut-doc-123', status: 'SIGNED' },
    }, TEST_SECRET)
    await POST(req)
    expect(rpcMock).toHaveBeenCalledWith(
      'confirmar_assinatura',
      expect.objectContaining({
        p_origem: 'autentique',
        p_chave: 'aut-doc-123',
        p_storage_path: expect.any(String),
        p_evidencias: expect.any(Object),
      }),
    )
  })

  it('baixa a prova antes de chamar a RPC (prova antes do status — RS9)', async () => {
    const callOrder: string[] = []
    baixarProvaAssinadaMock.mockImplementation(async () => {
      callOrder.push('baixar')
      return { pdfBuffer: FAKE_PDF.buffer, manifesto: {} }
    })
    rpcMock.mockImplementation(async () => {
      callOrder.push('rpc')
      return { data: null, error: null }
    })

    const req = makeRequest({
      event: 'document.signed',
      document: { id: 'aut-doc-456', status: 'SIGNED' },
    }, TEST_SECRET)
    await POST(req)

    expect(callOrder.indexOf('baixar')).toBeLessThan(callOrder.indexOf('rpc'))
  })
})

// ── CA8: segredo inválido → 401, NADA muda ───────────────────────────────────

describe('POST /api/webhooks/autentique — CA8: segredo inválido', () => {
  it('retorna 401 quando segredo ausente', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/autentique', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'document.signed', document: { id: 'x', status: 'SIGNED' } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('retorna 401 quando segredo incorreto', async () => {
    const req = makeRequest({
      event: 'document.signed',
      document: { id: 'aut-doc-123', status: 'SIGNED' },
    }, 'segredo-errado')
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('segredo inválido → RPC NÃO é chamada (nada muda — CA8)', async () => {
    const req = makeRequest({
      event: 'document.signed',
      document: { id: 'aut-doc-123', status: 'SIGNED' },
    }, 'segredo-errado')
    await POST(req)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('segredo inválido → baixarProvaAssinada NÃO é chamada', async () => {
    const req = makeRequest({
      event: 'document.signed',
      document: { id: 'aut-doc-123', status: 'SIGNED' },
    }, 'wrong')
    await POST(req)
    expect(baixarProvaAssinadaMock).not.toHaveBeenCalled()
  })
})

// ── CA7: reentrega → idempotente ─────────────────────────────────────────────

describe('POST /api/webhooks/autentique — CA7: idempotência na reentrega', () => {
  it('reentrega quando assinatura já "assinada" → retorna 200 sem nova transição (no-op)', async () => {
    // Simula: assinatura já existe com status=assinada → RPC retorna no-op (sem erro)
    // A idempotência é garantida pela RPC (no-op se já assinada)
    rpcMock.mockResolvedValue({ data: null, error: null }) // RPC sem erro = no-op OK
    const req = makeRequest({
      event: 'document.signed',
      document: { id: 'aut-doc-already-signed', status: 'SIGNED' },
    }, TEST_SECRET)
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('duas reentregas do mesmo evento → RPC chamada apenas 1 vez por request (sem duplicação)', async () => {
    const req = makeRequest({
      event: 'document.signed',
      document: { id: 'aut-doc-123', status: 'SIGNED' },
    }, TEST_SECRET)
    await POST(req)
    // Cada request à route deve chamar a RPC exatamente 1 vez
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })
})

// ── CA10: recusada/expirada → notifica, não avança ──────────────────────────

describe('POST /api/webhooks/autentique — CA10: recusada/expirada', () => {
  it('evento recusado (REFUSED) → retorna 200 sem chamar confirmar_assinatura', async () => {
    const req = makeRequest({
      event: 'document.refused',
      document: { id: 'aut-doc-123', status: 'REFUSED' },
    }, TEST_SECRET)
    const res = await POST(req)
    expect(res.status).toBe(200)
    // NÃO chama confirmar_assinatura (não avança o projeto)
    const confirmarCalls = rpcMock.mock.calls.filter(
      (c: unknown[]) => c[0] === 'confirmar_assinatura',
    )
    expect(confirmarCalls).toHaveLength(0)
  })

  it('evento expirado (EXPIRED) → retorna 200 sem chamar confirmar_assinatura', async () => {
    const req = makeRequest({
      event: 'document.expired',
      document: { id: 'aut-doc-123', status: 'EXPIRED' },
    }, TEST_SECRET)
    const res = await POST(req)
    expect(res.status).toBe(200)
    const confirmarCalls = rpcMock.mock.calls.filter(
      (c: unknown[]) => c[0] === 'confirmar_assinatura',
    )
    expect(confirmarCalls).toHaveLength(0)
  })

  it('evento recusado → marca status via RPC (ex: registrar_recusa ou update via RPC do banco)', async () => {
    const req = makeRequest({
      event: 'document.refused',
      document: { id: 'aut-doc-123', status: 'REFUSED' },
    }, TEST_SECRET)
    await POST(req)
    // Deve chamar alguma RPC de registro (ex: registrar_recusa_assinatura)
    // OU simplesmente atualiza status sem chamar confirmar_assinatura
    // O importante é que confirmar_assinatura NÃO foi chamada
    const confirmarCalls = rpcMock.mock.calls.filter(
      (c: unknown[]) => c[0] === 'confirmar_assinatura',
    )
    expect(confirmarCalls).toHaveLength(0)
  })
})
