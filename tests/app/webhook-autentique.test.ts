/**
 * T4.5 — Route Handler POST /api/webhooks/autentique (formato real do Autentique)
 * HMAC-SHA256(secret, rawBody) no header X-Autentique-Signature; payload
 * { event: { type, data: { document } } }; eventos signature.accepted /
 * document.finished / signature.rejected.
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

const assinado = (docId: string) => ({ event: { type: 'signature.accepted', data: { document: docId } } })

beforeEach(() => {
  vi.clearAllMocks()
  process.env['AUTENTIQUE_WEBHOOK_SECRET'] = TEST_SECRET
  baixarProvaAssinadaMock.mockResolvedValue({ pdfBuffer: FAKE_PDF.buffer, manifesto: { hash_sha256: 'abc123' } })
  uploadMock.mockResolvedValue({ data: { path: 'webhooks/autentique/x-assinado.pdf' }, error: null })
  storageMock.mockReturnValue({ upload: uploadMock })
  rpcMock.mockResolvedValue({ data: null, error: null })
  fromMock.mockReturnValue({ select: vi.fn() })
  adminClientMock.mockReturnValue({ rpc: rpcMock, storage: { from: storageMock }, from: fromMock })
})

import { POST } from '@/app/api/webhooks/autentique/route'

describe('POST /api/webhooks/autentique — HMAC válido (signature.accepted)', () => {
  it('retorna 200 com HMAC correto + evento assinado', async () => {
    const res = await POST(makeRequest(assinado('aut-doc-123')))
    expect(res.status).toBe(200)
  })

  it('chama confirmar_assinatura com origem=autentique, p_chave=event.data.document e storage_path', async () => {
    await POST(makeRequest(assinado('aut-doc-123')))
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

  it('baixa a prova ANTES de chamar a RPC (RS9)', async () => {
    const ordem: string[] = []
    baixarProvaAssinadaMock.mockImplementation(async () => { ordem.push('baixar'); return { pdfBuffer: FAKE_PDF.buffer, manifesto: {} } })
    rpcMock.mockImplementation(async () => { ordem.push('rpc'); return { data: null, error: null } })
    await POST(makeRequest(assinado('aut-doc-456')))
    expect(ordem.indexOf('baixar')).toBeLessThan(ordem.indexOf('rpc'))
  })

  it('document.finished também sela (idempotente)', async () => {
    const res = await POST(makeRequest({ event: { type: 'document.finished', data: { document: 'aut-doc-789' } } }))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('confirmar_assinatura', expect.objectContaining({ p_chave: 'aut-doc-789' }))
  })
})

describe('POST /api/webhooks/autentique — HMAC inválido (CA8)', () => {
  it('401 quando falta a assinatura', async () => {
    const res = await POST(makeRequest(assinado('x'), { sig: null }))
    expect(res.status).toBe(401)
  })

  it('401 quando o HMAC é de outro segredo', async () => {
    const res = await POST(makeRequest(assinado('x'), { secret: 'segredo-errado' }))
    expect(res.status).toBe(401)
  })

  it('HMAC inválido → confirmar_assinatura e baixarProva NÃO são chamados', async () => {
    await POST(makeRequest(assinado('x'), { sig: 'deadbeef' }))
    expect(rpcMock).not.toHaveBeenCalled()
    expect(baixarProvaAssinadaMock).not.toHaveBeenCalled()
  })

  it('401 quando AUTENTIQUE_WEBHOOK_SECRET não está configurado', async () => {
    delete process.env['AUTENTIQUE_WEBHOOK_SECRET']
    const res = await POST(makeRequest(assinado('x')))
    expect(res.status).toBe(401)
    process.env['AUTENTIQUE_WEBHOOK_SECRET'] = TEST_SECRET
  })
})

describe('POST /api/webhooks/autentique — recusa / evento ignorado', () => {
  it('signature.rejected → 200 sem chamar confirmar_assinatura', async () => {
    const res = await POST(makeRequest({ event: { type: 'signature.rejected', data: { document: 'aut-doc-123' } } }))
    expect(res.status).toBe(200)
    expect(rpcMock.mock.calls.filter((c: unknown[]) => c[0] === 'confirmar_assinatura')).toHaveLength(0)
  })

  it('evento desconhecido → 200 sem selar', async () => {
    const res = await POST(makeRequest({ event: { type: 'signature.viewed', data: { document: 'aut-doc-123' } } }))
    expect(res.status).toBe(200)
    expect(rpcMock.mock.calls.filter((c: unknown[]) => c[0] === 'confirmar_assinatura')).toHaveLength(0)
  })

  it('idempotência: confirmar_assinatura chamada 1x por request', async () => {
    await POST(makeRequest(assinado('aut-doc-123')))
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })
})
