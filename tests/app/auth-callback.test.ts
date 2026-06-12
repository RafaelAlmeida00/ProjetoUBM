/**
 * Hardening de segurança (achado Minor cybersec / OWASP A01 — open redirect).
 * Rota: src/app/auth/callback/route.ts (GET).
 * O parâmetro ?next é controlado pelo atacante via link enviado à vítima.
 * Regra: SÓ caminhos relativos internos são aceitos; qualquer destino externo
 * (absoluto, protocolo-relativo // ou truque /\) cai para o fallback seguro /app.
 *
 * TDD RED: com o código atual (redirect direto em new URL(next, req.url)),
 * os casos maliciosos redirecionam para fora do host → estes testes falham.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// --- mock do client server-side (não exercitamos exchangeCodeForSession aqui) ---
const { mockExchange } = vi.hoisted(() => ({ mockExchange: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { exchangeCodeForSession: mockExchange },
  }),
}))

import { GET } from '@/app/auth/callback/route'

const HOST = 'http://localhost'

/** Monta o request do callback com (ou sem) o parâmetro next, com encoding determinístico. */
function makeReq(nextParam?: string, code?: string): NextRequest {
  const u = new URL('/auth/callback', HOST)
  if (nextParam !== undefined) u.searchParams.set('next', nextParam)
  if (code !== undefined) u.searchParams.set('code', code)
  return new NextRequest(u)
}

/** Extrai o destino do header Location como URL absoluta. */
function locationOf(res: Response): URL {
  const loc = res.headers.get('location')
  expect(loc).toBeTruthy()
  return new URL(loc!)
}

describe('GET /auth/callback — validação anti open-redirect do ?next', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExchange.mockResolvedValue({ data: {}, error: null })
  })

  it('rejeita next absoluto (https://evil.example) → fallback /app no host interno', async () => {
    const loc = locationOf(await GET(makeReq('https://evil.example')))
    expect(loc.origin).toBe(HOST)
    expect(loc.pathname).toBe('/app')
  })

  it('rejeita next protocolo-relativo (//evil.example) → fallback /app no host interno', async () => {
    const loc = locationOf(await GET(makeReq('//evil.example')))
    expect(loc.origin).toBe(HOST)
    expect(loc.pathname).toBe('/app')
  })

  it('rejeita o truque de barra invertida (/\\evil) → fallback /app no host interno', async () => {
    const loc = locationOf(await GET(makeReq('/\\evil')))
    expect(loc.origin).toBe(HOST)
    expect(loc.pathname).toBe('/app')
  })

  it('aceita caminho relativo interno válido (/app/x?y=1) preservando query', async () => {
    const loc = locationOf(await GET(makeReq('/app/x?y=1')))
    expect(loc.origin).toBe(HOST)
    expect(loc.pathname).toBe('/app/x')
    expect(loc.search).toBe('?y=1')
  })

  it('usa o default /app quando next está ausente', async () => {
    const loc = locationOf(await GET(makeReq()))
    expect(loc.origin).toBe(HOST)
    expect(loc.pathname).toBe('/app')
  })

  it('não quebra o fluxo de exchangeCodeForSession (code presente ainda troca a sessão)', async () => {
    await GET(makeReq('https://evil.example', 'auth-code-123'))
    expect(mockExchange).toHaveBeenCalledTimes(1)
    expect(mockExchange).toHaveBeenCalledWith('auth-code-123')
  })
})
