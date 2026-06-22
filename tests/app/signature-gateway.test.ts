/**
 * T4.1 — Porta SignatureGateway + Fake + factory por env
 * RED: factory / Fake não existem ainda → testes falham.
 * GREEN: implementar lib/signature/gateway.ts + adapters/fake.ts + adapters/autentique.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Sem credenciais no env por padrão — factory deve cair no Fake
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv['AUTENTIQUE_API_TOKEN'] = process.env['AUTENTIQUE_API_TOKEN']
  savedEnv['AUTENTIQUE_TOKEN'] = process.env['AUTENTIQUE_TOKEN']
  savedEnv['AUTENTIQUE_SANDBOX'] = process.env['AUTENTIQUE_SANDBOX']
  delete process.env['AUTENTIQUE_API_TOKEN']
  delete process.env['AUTENTIQUE_TOKEN']
  delete process.env['AUTENTIQUE_SANDBOX']
})

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('getSignatureGateway() — factory por env', () => {
  it('sem AUTENTIQUE_API_TOKEN → retorna FakeSignatureGateway (não lança)', async () => {
    const { getSignatureGateway } = await import('@/lib/signature/gateway')
    const gw = getSignatureGateway()
    expect(gw).toBeDefined()
    // Fake deve ter os três métodos
    expect(typeof gw.criarPedido).toBe('function')
    expect(typeof gw.cancelarPedido).toBe('function')
    expect(typeof gw.baixarProvaAssinada).toBe('function')
  })

  it('sem token → gateway é identificado como Fake (não Autentique)', async () => {
    const { getSignatureGateway } = await import('@/lib/signature/gateway')
    const gw = getSignatureGateway()
    // O Fake se identifica por uma propriedade pública discriminante
    expect((gw as Record<string, unknown>)['_isFake']).toBe(true)
  })

  it('PRODUÇÃO sem token → LANÇA (nunca assina com Fake)', async () => {
    const saved = process.env['VERCEL_ENV']
    process.env['VERCEL_ENV'] = 'production'
    try {
      const { getSignatureGateway } = await import('@/lib/signature/gateway')
      // mensagem cita Autentique e NÃO contém "pdf"/"mime" (não confunde o mapDbError)
      let msg = ''
      try { getSignatureGateway() } catch (e) { msg = e instanceof Error ? e.message : String(e) }
      expect(msg).toMatch(/autentique/i)
      expect(msg).not.toMatch(/pdf|mime/i)
    } finally {
      if (saved === undefined) delete process.env['VERCEL_ENV']
      else process.env['VERCEL_ENV'] = saved
    }
  })

  it('AUTENTIQUE_TOKEN (alias) também seleciona o Autentique (não Fake)', async () => {
    process.env['AUTENTIQUE_TOKEN'] = 'tok-alias-xyz'
    try {
      const { getSignatureGateway } = await import('@/lib/signature/gateway')
      const gw = getSignatureGateway()
      expect((gw as Record<string, unknown>)['_isFake']).toBe(false)
    } finally {
      delete process.env['AUTENTIQUE_TOKEN']
    }
  })
})

describe('FakeSignatureGateway.criarPedido', () => {
  it('retorna provedor_doc_id determinístico (não vazio)', async () => {
    const { getSignatureGateway } = await import('@/lib/signature/gateway')
    const gw = getSignatureGateway()
    const result = await gw.criarPedido({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      storagePath: 'propostas/proj-1/original.pdf',
      signatario: { nome: 'Rep Silva', email: 'rep@empresa.com' },
    })
    expect(result.provedor_doc_id).toBeTruthy()
    expect(typeof result.provedor_doc_id).toBe('string')
  })

  it('inclui clausulaAceiteMeioEletronico=true no pedido (CA4/CA9)', async () => {
    const { getSignatureGateway } = await import('@/lib/signature/gateway')
    const gw = getSignatureGateway()
    const result = await gw.criarPedido({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      storagePath: 'propostas/proj-1/original.pdf',
      signatario: { nome: 'Rep Silva', email: 'rep@empresa.com' },
      clausulaAceiteMeioEletronico: true,
    })
    expect(result.clausulaAceiteMeioEletronico).toBe(true)
  })

  it('signatário único = o representante passado (CA9 — nunca mais de um)', async () => {
    const { getSignatureGateway } = await import('@/lib/signature/gateway')
    const gw = getSignatureGateway()
    const result = await gw.criarPedido({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      storagePath: 'propostas/proj-1/original.pdf',
      signatario: { nome: 'Rep Silva', email: 'rep@empresa.com' },
    })
    expect(result.signatarios).toHaveLength(1)
    expect(result.signatarios[0].email).toBe('rep@empresa.com')
  })
})

describe('FakeSignatureGateway.cancelarPedido — idempotente', () => {
  it('cancelar um pedido existente retorna ok', async () => {
    const { getSignatureGateway } = await import('@/lib/signature/gateway')
    const gw = getSignatureGateway()
    // Primeiro cria
    const { provedor_doc_id } = await gw.criarPedido({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
      storagePath: 'propostas/proj-1/original.pdf',
      signatario: { nome: 'Rep Silva', email: 'rep@empresa.com' },
    })
    // Cancela
    await expect(gw.cancelarPedido(provedor_doc_id)).resolves.toBeUndefined()
  })

  it('cancelar um pedido inexistente também não lança (idempotente)', async () => {
    const { getSignatureGateway } = await import('@/lib/signature/gateway')
    const gw = getSignatureGateway()
    await expect(gw.cancelarPedido('provedor-doc-inexistente')).resolves.toBeUndefined()
  })

  it('cancelar duas vezes o mesmo pedido não lança (idempotente x2)', async () => {
    const { getSignatureGateway } = await import('@/lib/signature/gateway')
    const gw = getSignatureGateway()
    const { provedor_doc_id } = await gw.criarPedido({
      projetoId: 'proj-1',
      documentoId: 'doc-2',
      storagePath: 'propostas/proj-1/original2.pdf',
      signatario: { nome: 'Rep', email: 'rep2@empresa.com' },
    })
    await gw.cancelarPedido(provedor_doc_id)
    await expect(gw.cancelarPedido(provedor_doc_id)).resolves.toBeUndefined()
  })
})

describe('FakeSignatureGateway.baixarProvaAssinada', () => {
  it('retorna um buffer não-vazio (pdf fake)', async () => {
    const { getSignatureGateway } = await import('@/lib/signature/gateway')
    const gw = getSignatureGateway()
    const { provedor_doc_id } = await gw.criarPedido({
      projetoId: 'proj-1',
      documentoId: 'doc-3',
      storagePath: 'propostas/proj-1/original3.pdf',
      signatario: { nome: 'Rep', email: 'rep3@empresa.com' },
    })
    const result = await gw.baixarProvaAssinada(provedor_doc_id)
    expect(result.pdfBuffer.byteLength).toBeGreaterThan(0)
    expect(result.manifesto).toBeDefined()
  })
})

describe('AutentiqueGateway.criarPedido (multipart real)', () => {
  it('POSTa multipart para /v2/graphql e retorna provedor_doc_id + short_link', async () => {
    process.env['AUTENTIQUE_API_TOKEN'] = 'tok-test'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          createDocument: {
            id: 'doc-aut-1',
            signatures: [
              { public_id: 'p1', email: 'rep@e.com', link: { short_link: 'https://autentique.com.br/assinar/abc' } },
            ],
          },
        },
      }),
    })
    const origFetch = global.fetch
    global.fetch = fetchMock as unknown as typeof fetch
    try {
      const { getSignatureGateway } = await import('@/lib/signature/gateway')
      const gw = getSignatureGateway()
      const res = await gw.criarPedido({
        projetoId: 'proj-1',
        documentoId: 'doc-1',
        storagePath: 'propostas/p.pdf',
        signatario: { nome: 'Rep', email: 'rep@e.com' },
        pdfBuffer: new Uint8Array([1, 2, 3]).buffer,
      })
      expect(res.provedor_doc_id).toBe('doc-aut-1')
      expect(res.link_assinatura).toBe('https://autentique.com.br/assinar/abc')
      const [url, opts] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: unknown }]
      expect(url).toBe('https://api.autentique.com.br/v2/graphql')
      expect(opts.method).toBe('POST')
      expect(opts.headers.Authorization).toMatch(/Bearer tok-test/)
      expect(opts.body).toBeInstanceOf(FormData)
    } finally {
      global.fetch = origFetch
      delete process.env['AUTENTIQUE_API_TOKEN']
    }
  })

  it('falha com mensagem clara quando falta o pdfBuffer', async () => {
    process.env['AUTENTIQUE_API_TOKEN'] = 'tok-test'
    try {
      const { getSignatureGateway } = await import('@/lib/signature/gateway')
      const gw = getSignatureGateway()
      await expect(
        gw.criarPedido({
          projetoId: 'p',
          documentoId: 'd',
          storagePath: 's',
          signatario: { nome: 'R', email: 'r@e.com' },
        }),
      ).rejects.toThrow(/PDF/i)
    } finally {
      delete process.env['AUTENTIQUE_API_TOKEN']
    }
  })
})

describe('AutentiqueGateway.baixarProvaAssinada (campos REAIS da API v2)', () => {
  it('consulta hashes.sha2 + signed{created_at,ip} e monta o manifesto do signatário que assinou', async () => {
    process.env['AUTENTIQUE_API_TOKEN'] = 'tok-test'
    const gqlResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          document: {
            id: 'doc-aut-1',
            files: { signed: 'https://api.autentique.com.br/documentos/doc-aut-1/assinado.pdf' },
            hashes: { sha2: 'abc123hash' },
            signatures: [
              // [0] = observador/CC (não assinou) — NÃO deve virar o manifesto
              { name: null, email: 'cc@e.com', signed: null },
              { name: 'Rep', email: 'rep@e.com', signed: { created_at: '2026-06-22T20:19:01.000000Z', ip: '189.84.181.239' } },
            ],
          },
        },
      }),
    }
    const pdfResponse = { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer }
    const fetchMock = vi.fn().mockResolvedValueOnce(gqlResponse).mockResolvedValueOnce(pdfResponse)
    const origFetch = global.fetch
    global.fetch = fetchMock as unknown as typeof fetch
    try {
      const { getSignatureGateway } = await import('@/lib/signature/gateway')
      const gw = getSignatureGateway()
      const res = await gw.baixarProvaAssinada('doc-aut-1')
      // A query usa os campos REAIS (sha2 + signed{...}), não os inexistentes (ip direto / certificate.sha256)
      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { query: string }
      expect(body.query).toMatch(/hashes\s*\{\s*sha2/)
      expect(body.query).toMatch(/signed\s*\{[^}]*ip/)
      expect(body.query).not.toMatch(/certificate\s*\{\s*sha256/)
      // Manifesto vem do signatário que ASSINOU (não do [0] observador)
      expect(res.manifesto['hash_sha256']).toBe('abc123hash')
      expect(res.manifesto['assinado_em']).toBe('2026-06-22T20:19:01.000000Z')
      expect(res.manifesto['ip_signatario']).toBe('189.84.181.239')
      expect(res.manifesto['email_signatario']).toBe('rep@e.com')
      expect(res.pdfBuffer.byteLength).toBeGreaterThan(0)
    } finally {
      global.fetch = origFetch
      delete process.env['AUTENTIQUE_API_TOKEN']
    }
  })
})
