/**
 * T4.5 — Route Handler POST /api/webhooks/autentique (FORMATO REAL do Autentique)
 * HMAC-SHA256(secret, rawBody) no header X-Autentique-Signature.
 * Body: { id, object, event: { id, type, data: { public_id, object, ... } } }.
 * O identificador vem em event.data.public_id (NÃO event.data.document):
 *   · document.finished → data.public_id = id do DOCUMENTO (= provedor_doc_id) → SELA.
 *   · signature.accepted → data.public_id = public_id da ASSINATURA (não casa com o doc)
 *       → NÃO sela (o selo vem do document.finished); best-effort sela se vier data.document.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'node:crypto'

// ── mocks hoisted ──────────────────────────────────────────────────────────────
const { rpcMock, storageMock, uploadMock, fromMock, baixarProvaAssinadaMock, adminClientMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  storageMock: vi.fn(),
  uploadMock: vi.fn(),
  fromMock: vi.fn(),
  baixarProvaAssinadaMock: vi.fn(),
  adminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: adminClientMock }))
vi.mock('@/lib/signature/gateway', () => ({
  getSignatureGateway: vi.fn().mockReturnValue({
    _isFake: true,
    criarPedido: vi.fn(),
    cancelarPedido: vi.fn().mockResolvedValue(undefined),
    baixarProvaAssinada: baixarProvaAssinadaMock,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const TEST_SECRET = 'test-webhook-secret-2026'
const TEST_SECRET_DOC = 'test-webhook-secret-doc-2026'
const FAKE_PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]) // %PDF-1.4

function hmac(raw: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
}

/** Monta a request assinando o corpo com HMAC-SHA256 (default: segredo correto). */
function makeRequest(body: unknown, opts?: { secret?: string; sig?: string | null }): NextRequest {
  const raw = JSON.stringify(body)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const sig = opts?.sig === null ? null : (opts?.sig ?? hmac(raw, opts?.secret ?? TEST_SECRET))
  if (sig !== null) headers['x-autentique-signature'] = sig
  return new NextRequest('http://localhost/api/webhooks/autentique', { method: 'POST', headers, body: raw })
}

// Formato REAL do Autentique: o id vem em event.data.public_id.
const docFinished = (docId: string) => ({
  id: 'wh-1',
  object: 'webhook',
  event: { id: 'ev-1', type: 'document.finished', data: { public_id: docId, object: 'document' } },
})
const sigAccepted = (signatureId: string, extra?: Record<string, unknown>) => ({
  id: 'wh-1',
  object: 'webhook',
  event: { id: 'ev-1', type: 'signature.accepted', data: { public_id: signatureId, object: 'signature', ...extra } },
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env['AUTENTIQUE_WEBHOOK_SECRET_SIGN'] = TEST_SECRET
  process.env['AUTENTIQUE_WEBHOOK_SECRET_DOC'] = TEST_SECRET_DOC
  delete process.env['AUTENTIQUE_WEBHOOK_SECRET']
  baixarProvaAssinadaMock.mockResolvedValue({ pdfBuffer: FAKE_PDF.buffer, manifesto: { hash_sha256: 'abc123' } })
  uploadMock.mockResolvedValue({ data: { path: 'webhooks/autentique/x-assinado.pdf' }, error: null })
  storageMock.mockReturnValue({ upload: uploadMock })
  rpcMock.mockResolvedValue({ data: null, error: null })
  fromMock.mockReturnValue({ select: vi.fn() })
  adminClientMock.mockReturnValue({ rpc: rpcMock, storage: { from: storageMock }, from: fromMock })
})

import { POST } from '@/app/api/webhooks/autentique/route'

describe('POST /api/webhooks/autentique — document.finished SELA (formato real, public_id = id do doc)', () => {
  it('retorna 200 com HMAC correto + document.finished', async () => {
    const res = await POST(makeRequest(docFinished('aut-doc-123')))
    expect(res.status).toBe(200)
  })

  it('chama confirmar_assinatura com origem=autentique, p_chave=event.data.public_id e storage_path', async () => {
    await POST(makeRequest(docFinished('aut-doc-123')))
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

  it('baixa a prova (com o id do doc) ANTES de chamar a RPC (RS9)', async () => {
    const ordem: string[] = []
    baixarProvaAssinadaMock.mockImplementation(async (id: string) => {
      ordem.push(`baixar:${id}`)
      return { pdfBuffer: FAKE_PDF.buffer, manifesto: {} }
    })
    rpcMock.mockImplementation(async () => { ordem.push('rpc'); return { data: null, error: null } })
    await POST(makeRequest(docFinished('aut-doc-456')))
    expect(ordem[0]).toBe('baixar:aut-doc-456')
    expect(ordem.indexOf('baixar:aut-doc-456')).toBeLessThan(ordem.indexOf('rpc'))
  })

  it('aceita o HMAC do 2º webhook (segredo DOC) — document.finished', async () => {
    const res = await POST(makeRequest(docFinished('aut-doc-doc'), { secret: TEST_SECRET_DOC }))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('confirmar_assinatura', expect.objectContaining({ p_chave: 'aut-doc-doc' }))
  })

  it('idempotência: confirmar_assinatura chamada 1x por request', async () => {
    await POST(makeRequest(docFinished('aut-doc-123')))
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/webhooks/autentique — signature.accepted NÃO sela (public_id é da assinatura)', () => {
  it('200 (ack) sem chamar confirmar_assinatura quando só vem public_id da assinatura', async () => {
    const res = await POST(makeRequest(sigAccepted('f4b9e8bb6e1211f1818d42010a2b6021')))
    expect(res.status).toBe(200)
    expect(rpcMock.mock.calls.filter((c: unknown[]) => c[0] === 'confirmar_assinatura')).toHaveLength(0)
    expect(baixarProvaAssinadaMock).not.toHaveBeenCalled()
  })

  it('NÃO devolve 400 no formato real (regressão do bug que rejeitava toda entrega)', async () => {
    const res = await POST(makeRequest(sigAccepted('f4b9e8bb6e1211f1818d42010a2b6021')))
    expect(res.status).not.toBe(400)
  })

  it('best-effort: sela se o payload trouxer event.data.document (id do doc)', async () => {
    const res = await POST(makeRequest(sigAccepted('sig-public-id', { document: 'aut-doc-789' })))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('confirmar_assinatura', expect.objectContaining({ p_chave: 'aut-doc-789' }))
  })
})

describe('POST /api/webhooks/autentique — HMAC inválido (CA8)', () => {
  it('401 quando falta a assinatura', async () => {
    const res = await POST(makeRequest(docFinished('x'), { sig: null }))
    expect(res.status).toBe(401)
  })

  it('401 quando o HMAC é de outro segredo', async () => {
    const res = await POST(makeRequest(docFinished('x'), { secret: 'segredo-errado' }))
    expect(res.status).toBe(401)
  })

  it('HMAC inválido → confirmar_assinatura e baixarProva NÃO são chamados', async () => {
    await POST(makeRequest(docFinished('x'), { sig: 'deadbeef' }))
    expect(rpcMock).not.toHaveBeenCalled()
    expect(baixarProvaAssinadaMock).not.toHaveBeenCalled()
  })

  it('401 quando NENHUM secret está configurado', async () => {
    delete process.env['AUTENTIQUE_WEBHOOK_SECRET_SIGN']
    delete process.env['AUTENTIQUE_WEBHOOK_SECRET_DOC']
    delete process.env['AUTENTIQUE_WEBHOOK_SECRET']
    const res = await POST(makeRequest(docFinished('x')))
    expect(res.status).toBe(401)
    process.env['AUTENTIQUE_WEBHOOK_SECRET_SIGN'] = TEST_SECRET
  })
})

describe('POST /api/webhooks/autentique — recusa / evento ignorado', () => {
  it('signature.rejected → 200 sem chamar confirmar_assinatura', async () => {
    const body = { id: 'wh', object: 'webhook', event: { id: 'e', type: 'signature.rejected', data: { public_id: 'sig-x', object: 'signature' } } }
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(200)
    expect(rpcMock.mock.calls.filter((c: unknown[]) => c[0] === 'confirmar_assinatura')).toHaveLength(0)
  })

  it('document.created (evento errado/ignorado) → 200 sem selar', async () => {
    const body = { id: 'wh', object: 'webhook', event: { id: 'e', type: 'document.created', data: { public_id: 'aut-doc-123', object: 'document' } } }
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(200)
    expect(rpcMock.mock.calls.filter((c: unknown[]) => c[0] === 'confirmar_assinatura')).toHaveLength(0)
  })

  it('evento desconhecido → 200 sem selar', async () => {
    const body = { id: 'wh', object: 'webhook', event: { id: 'e', type: 'signature.viewed', data: { public_id: 'sig-x', object: 'signature' } } }
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(200)
    expect(rpcMock.mock.calls.filter((c: unknown[]) => c[0] === 'confirmar_assinatura')).toHaveLength(0)
  })
})
