import { describe, it, expect, vi, beforeEach } from 'vitest'

// 'server-only' lança fora de RSC — stub no teste.
vi.mock('server-only', () => ({}))
// Mock do envio real (Resend) — testamos a COLA, não a entrega.
const enviarEmail = vi.fn()
vi.mock('../../../src/lib/email/resend', () => ({ enviarEmail: (...a: unknown[]) => enviarEmail(...a) }))

import { enviarVerificacao } from '../../../src/lib/email/verificacao'

function fakeSupabase(rpcResult: { data?: unknown; error?: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) } as never
}

describe('enviarVerificacao (cola RPC → Resend)', () => {
  beforeEach(() => {
    enviarEmail.mockReset()
    enviarEmail.mockResolvedValue({ ok: true })
  })

  it('NÃO envia quando a RPC diz enviar=false (já verificado / token pendente)', async () => {
    const sb = fakeSupabase({ data: [{ enviar: false }], error: null })
    const r = await enviarVerificacao(sb, 'http://localhost:3000', false)
    expect(r).toEqual({ ok: true, enviado: false })
    expect(enviarEmail).not.toHaveBeenCalled()
  })

  it('envia via Resend com o LINK quando enviar=true', async () => {
    const sb = fakeSupabase({
      data: [{ enviar: true, destinatario: 'ana@empresa.com.br', link: 'http://localhost:3000/auth/verify?token=abc', nome: 'Ana' }],
      error: null,
    })
    const r = await enviarVerificacao(sb, 'http://localhost:3000', false)
    expect(r.ok).toBe(true)
    expect(r.enviado).toBe(true)
    expect(enviarEmail).toHaveBeenCalledTimes(1)
    const arg = enviarEmail.mock.calls[0][0]
    expect(arg.to).toBe('ana@empresa.com.br')
    expect(arg.html).toContain('http://localhost:3000/auth/verify?token=abc')
    expect(arg.subject).toMatch(/confirme sua conta/i)
  })

  it('propaga erro da RPC sem enviar', async () => {
    const sb = fakeSupabase({ data: null, error: { message: 'rate-limit' } })
    const r = await enviarVerificacao(sb, 'http://localhost:3000', true)
    expect(r.ok).toBe(false)
    expect(r.enviado).toBe(false)
    expect(enviarEmail).not.toHaveBeenCalled()
  })

  it('escapa o nome no HTML (anti-injeção)', async () => {
    const sb = fakeSupabase({
      data: [{ enviar: true, destinatario: 'x@y.com', link: 'http://h/auth/verify?token=t', nome: '<script>x</script>' }],
      error: null,
    })
    await enviarVerificacao(sb, 'http://h', false)
    const arg = enviarEmail.mock.calls[0][0]
    expect(arg.html).not.toContain('<script>x</script>')
    expect(arg.html).toContain('&lt;script&gt;')
  })
})
