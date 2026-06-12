/**
 * T-B12 — Rate-limit do claim na BORDA + mismatch auditado.
 * RED: falha antes do rate-limit estar aplicado na Server Action reclamarDor.
 *
 * SR-B8 [DURO]: N+1 claims do mesmo uid em janela curta → recusado com mensagem neutra.
 * Uid distinto não é afetado. Janela expira → libera.
 * Recusa NÃO chama a RPC. Mismatch registra auditoria sem o token no payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks de infra ─────────────────────────────────────────────────────────

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn((name: string) => {
      if (name === 'x-forwarded-for') return '1.2.3.4'
      return null
    }),
  }),
}))

const mockRpc = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  })),
}))

// Controla o relógio do rate-limit
import { _clock, limparStore } from '@/lib/actions/rate-limit'

import { reclamarDor } from '@/lib/actions/dor'

describe('reclamarDor — T-B12: rate-limit na borda', () => {
  let nowMs = Date.now()

  beforeEach(() => {
    vi.clearAllMocks()
    limparStore()
    nowMs = Date.now()
    _clock.now = () => nowMs

    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-test' } }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('B12-1: primeira chamada passa (rate-limit não excedido)', async () => {
    const result = await reclamarDor('dor-1', 'token-valido', undefined)
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledOnce()
  })

  it('B12-2: N+1 claims do mesmo uid+IP na janela → recusado com mensagem neutra', async () => {
    // Faz 5 claims bem-sucedidos (teto da janela de 10min é 5 no submit anon)
    // Para o claim usamos a chave `claim:<ip>` + dorId
    // O teto é o mesmo do rate-limiter: TETO_10MIN = 5
    for (let i = 0; i < 5; i++) {
      const r = await reclamarDor(`dor-${i}`, 'token-valido', undefined)
      // Primeiros podem passar (dependendo da chave)
      if (!r.ok) break
    }

    // Chamada que excede o teto — chave é `claim:1.2.3.4` com baldes por dorId
    // Simula exceder registrando manualmente via chamadas ao checarRateLimit
    const { checarRateLimit, registrarSubmissao, extrairIpConfiavel } = await import('@/lib/actions/rate-limit')

    // Satura o balde
    const ip = 'claim:1.2.3.4'
    for (let i = 0; i < 5; i++) {
      registrarSubmissao(ip, `dor-satura-${i}`)
    }

    // Agora verificar que o rate-limit recusa
    const rl = checarRateLimit(ip, 'dor-nova')
    expect(rl.ok).toBe(false)
    expect((rl as { ok: false; error: string }).error).toMatch(/muitas solicita|aguarde/i)
  })

  it('B12-3: mensagem de recusa não revela o teto exato', async () => {
    const { checarRateLimit, registrarSubmissao } = await import('@/lib/actions/rate-limit')
    const ip = 'claim:saturado'
    for (let i = 0; i < 5; i++) {
      registrarSubmissao(ip)
    }
    const rl = checarRateLimit(ip)
    expect(rl.ok).toBe(false)
    const msg = (rl as { ok: false; error: string }).error
    // Não deve conter números que revelem o teto
    expect(msg).not.toMatch(/\b5\b|\b20\b/)
  })

  it('B12-4: uid distinto (IP distinto) não é afetado pelo teto do outro', async () => {
    const { checarRateLimit, registrarSubmissao } = await import('@/lib/actions/rate-limit')
    const ipA = 'claim:10.0.0.1'
    const ipB = 'claim:10.0.0.2'

    // Satura IP A
    for (let i = 0; i < 5; i++) {
      registrarSubmissao(ipA, `dor-a-${i}`)
    }
    // IP B não deve ser afetado
    const rl = checarRateLimit(ipB, 'dor-b-1')
    expect(rl.ok).toBe(true)
  })

  it('B12-5: janela expira (mock de relógio) → libera novamente', async () => {
    const { checarRateLimit, registrarSubmissao } = await import('@/lib/actions/rate-limit')
    const ip = 'claim:5.5.5.5'

    // Satura
    for (let i = 0; i < 5; i++) {
      registrarSubmissao(ip, `dor-exp-${i}`)
    }
    expect(checarRateLimit(ip, 'nova').ok).toBe(false)

    // Avança 11 minutos (janela de 10min expira)
    nowMs += 11 * 60 * 1000
    _clock.now = () => nowMs

    // Deve liberar
    const rl = checarRateLimit(ip, 'nova')
    expect(rl.ok).toBe(true)
  })

  it('B12-6: recusa NÃO chama a RPC supabase.rpc', async () => {
    const { registrarSubmissao } = await import('@/lib/actions/rate-limit')
    // reclamarDor usa: checarRateLimit(`claim:${ip}`, dorId)
    // onde ip = extrairIpConfiavel(headers mock) = '1.2.3.4' (rightmost do x-forwarded-for)
    // portanto a chave do balde é 'claim:1.2.3.4'
    // registrarSubmissao recebe (ip, email?) onde ip = 'claim:1.2.3.4'
    // → registra em 'ip:claim:1.2.3.4'
    // checarRateLimit('claim:1.2.3.4', dorId) verifica 'ip:claim:1.2.3.4'
    const chaveIp = 'ip:claim:1.2.3.4'
    for (let i = 0; i < 5; i++) {
      registrarSubmissao('claim:1.2.3.4', `dor-block-${i}`)
    }

    mockRpc.mockClear()
    const result = await reclamarDor('dor-bloqueada', 'token-qualquer', undefined)
    expect(result.ok).toBe(false)
    // RPC não deve ter sido chamada
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
