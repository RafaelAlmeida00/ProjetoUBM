import { describe, it, expect } from 'vitest'
import nextConfig from '@/next.config'

// T3a — RS11 (headers de segurança)
describe('next.config — headers de segurança', () => {
  it('declara X-Frame-Options DENY, nosniff e Referrer-Policy', async () => {
    expect(typeof nextConfig.headers).toBe('function')
    const groups = await nextConfig.headers!()
    const all = groups.flatMap((g) => g.headers)
    const map = Object.fromEntries(all.map((h) => [h.key, h.value]))
    expect(map['X-Frame-Options']).toBe('DENY')
    expect(map['X-Content-Type-Options']).toBe('nosniff')
    expect(map['Referrer-Policy']).toBeTruthy()
  })
})
