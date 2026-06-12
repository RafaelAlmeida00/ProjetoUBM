// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub do client SSR: getUser controlável por teste.
const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: getUserMock } }),
}))
// Env presente → o middleware NÃO faz no-op (caminho real).
vi.mock('@/lib/supabase/env', () => ({ SUPABASE_URL: 'http://supa.local', SUPABASE_KEY: 'anon-key' }))

import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'

const req = (path: string) => new NextRequest(new URL('http://localhost:3000' + path))

describe('middleware — gate de sessão + redirect de quem já está logado', () => {
  beforeEach(() => getUserMock.mockReset())

  it('logado em / → redireciona para /app (não deveria ficar na landing)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(req('/'))
    expect(String(res.headers.get('location'))).toMatch(/\/app$/)
  })

  it('logado em /login → redireciona para /app', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(req('/login'))
    expect(String(res.headers.get('location'))).toMatch(/\/app$/)
  })

  it('anônimo em / → NÃO redireciona (landing é pública)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('anônimo em /app → manda para /login?next=/app/dores (gate de sessão preservado)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await middleware(req('/app/dores'))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fapp%2Fdores')
  })
})
