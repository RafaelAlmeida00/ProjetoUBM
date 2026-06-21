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
  savedEnv['AUTENTIQUE_SANDBOX'] = process.env['AUTENTIQUE_SANDBOX']
  delete process.env['AUTENTIQUE_API_TOKEN']
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
      expect(() => getSignatureGateway()).toThrow(/autentique/i)
    } finally {
      if (saved === undefined) delete process.env['VERCEL_ENV']
      else process.env['VERCEL_ENV'] = saved
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
