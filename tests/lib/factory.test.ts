import { describe, it, expect, afterEach } from 'vitest'
import { hasSupabaseEnv, getGateways } from '@/lib/factory'
import { FakeAuthGateway } from '@/lib/auth/fake-auth-gateway'
import { InMemoryProposalRepository } from '@/lib/data/in-memory-proposal-repository'

// T1f — factory por env (ADR-0002/§12): sem chaves → mocks.
describe('lib/factory', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  afterEach(() => {
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url
    if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key
  })

  it('sem env Supabase, hasSupabaseEnv = false e cai nos mocks', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    expect(hasSupabaseEnv()).toBe(false)
    const g = getGateways()
    expect(g.auth).toBeInstanceOf(FakeAuthGateway)
    expect(g.proposals).toBeInstanceOf(InMemoryProposalRepository)
  })

  it('detecta env Supabase quando presente', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    expect(hasSupabaseEnv()).toBe(true)
  })
})
