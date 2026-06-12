/**
 * T-AN11 — Rate-limit por IP+janela na Server Action de submit anônimo.
 * SR-A3 [DURO] — dois tetos: ≤5/10min e ≤20/24h por IP.
 * Sem revelar o teto exato na mensagem de recusa (PT-BR neutro).
 * A recusa NÃO chama a RPC subjacente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checarRateLimit,
  registrarSubmissao,
  limparStore,
  extrairIpConfiavel,
  _clock,
} from '@/lib/actions/rate-limit'

const T0 = 1_700_000_000_000 // timestamp fixo (ms)

describe('checarRateLimit — janela 10 min (≤5 submissões)', () => {
  beforeEach(() => {
    limparStore()
    _clock.now = vi.fn(() => T0)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('primeira submissão é permitida', () => {
    expect(checarRateLimit('203.0.113.1')).toEqual({ ok: true })
  })

  it('5ª submissão dentro de 10min é permitida', () => {
    const ip = '203.0.113.1'
    for (let i = 0; i < 4; i++) {
      _clock.now = vi.fn(() => T0 + i * 60_000)
      registrarSubmissao(ip)
    }
    _clock.now = vi.fn(() => T0 + 4 * 60_000)
    expect(checarRateLimit(ip)).toEqual({ ok: true })
  })

  it('6ª submissão dentro de 10min é RECUSADA (teto 5/10min)', () => {
    const ip = '203.0.113.1'
    _clock.now = vi.fn(() => T0)
    for (let i = 0; i < 5; i++) registrarSubmissao(ip)
    const result = checarRateLimit(ip)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
      // mensagem neutra — não revela o teto
      expect(result.error).not.toMatch(/\b5\b/)
      expect(result.error).not.toMatch(/\b10\b/)
    }
  })

  it('IP distinto não é afetado pelo teto do outro IP', () => {
    const ipA = '203.0.113.1'
    const ipB = '203.0.113.2'
    _clock.now = vi.fn(() => T0)
    for (let i = 0; i < 5; i++) registrarSubmissao(ipA)
    expect(checarRateLimit(ipB)).toEqual({ ok: true })
  })

  it('janela de 10min expira e libera o IP (mock de relógio)', () => {
    const ip = '203.0.113.1'
    _clock.now = vi.fn(() => T0)
    for (let i = 0; i < 5; i++) registrarSubmissao(ip)
    // Avança 10 minutos + 1 segundo
    _clock.now = vi.fn(() => T0 + 10 * 60_000 + 1_000)
    expect(checarRateLimit(ip)).toEqual({ ok: true })
  })
})

describe('checarRateLimit — janela 24h (≤20 submissões)', () => {
  beforeEach(() => {
    limparStore()
    _clock.now = vi.fn(() => T0)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('20ª submissão em <24h é permitida', () => {
    const ip = '203.0.113.1'
    // Espaçadas em 60min para não bater no teto de 10min
    for (let i = 0; i < 19; i++) {
      _clock.now = vi.fn(() => T0 + i * 60 * 60_000)
      registrarSubmissao(ip)
    }
    _clock.now = vi.fn(() => T0 + 19 * 60 * 60_000)
    expect(checarRateLimit(ip)).toEqual({ ok: true })
  })

  it('21ª submissão em <24h é RECUSADA (teto 20/24h)', () => {
    const ip = '203.0.113.1'
    for (let i = 0; i < 20; i++) {
      _clock.now = vi.fn(() => T0 + i * 60 * 60_000)
      registrarSubmissao(ip)
    }
    _clock.now = vi.fn(() => T0 + 20 * 60 * 60_000)
    const result = checarRateLimit(ip)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
      // mensagem neutra — não revela o teto exato
      expect(result.error).not.toMatch(/\b20\b/)
      expect(result.error).not.toMatch(/\b24\b/)
    }
  })

  it('janela de 24h expira e libera o IP', () => {
    const ip = '203.0.113.1'
    for (let i = 0; i < 20; i++) {
      _clock.now = vi.fn(() => T0 + i * 60 * 60_000)
      registrarSubmissao(ip)
    }
    // Avança 24h + 1s a partir do registro mais antigo (T0)
    _clock.now = vi.fn(() => T0 + 24 * 60 * 60_000 + 1_000)
    expect(checarRateLimit(ip)).toEqual({ ok: true })
  })
})

describe('checarRateLimit — semântica checar vs registrar', () => {
  beforeEach(() => {
    limparStore()
    _clock.now = vi.fn(() => T0)
  })

  it('checar sem registrar é sempre ok (sem side-effect)', () => {
    const ip = '203.0.113.1'
    expect(checarRateLimit(ip)).toEqual({ ok: true })
    expect(checarRateLimit(ip)).toEqual({ ok: true })
  })

  it('5 ciclos checar+registrar ok; 6ª checagem recusada; continua recusada', () => {
    const ip = '203.0.113.1'
    _clock.now = vi.fn(() => T0)
    for (let i = 0; i < 5; i++) {
      expect(checarRateLimit(ip)).toEqual({ ok: true })
      registrarSubmissao(ip)
    }
    expect(checarRateLimit(ip).ok).toBe(false)
    // state permanece travado — não muda só por checar
    expect(checarRateLimit(ip).ok).toBe(false)
  })
})

// ─── T-AN11b [SEC-FIX] — IP confiável (XFF spoofável) + chave secundária por e-mail ───

describe('extrairIpConfiavel — XFF não-spoofável (SR-A3/STRIDE T-A02)', () => {
  /** Helper: monta um getter de header a partir de um objeto simples. */
  const getter = (h: Record<string, string | undefined>) => (name: string) =>
    h[name.toLowerCase()] ?? null

  it('prefere o header da plataforma (x-vercel-forwarded-for) quando presente', () => {
    const ip = extrairIpConfiavel(
      getter({
        'x-vercel-forwarded-for': '198.51.100.7',
        'x-forwarded-for': '1.2.3.4, 198.51.100.7, 10.0.0.1',
      }),
    )
    expect(ip).toBe('198.51.100.7')
  })

  it('usa o hop MAIS À DIREITA do x-forwarded-for (apendado pelo proxy), nunca o leftmost', () => {
    // Atacante injeta um IP forjado no leftmost; o proxy confiável apenda o real à direita.
    const ip = extrairIpConfiavel(
      getter({ 'x-forwarded-for': '6.6.6.6, 7.7.7.7, 203.0.113.9' }),
    )
    expect(ip).toBe('203.0.113.9') // rightmost, não '6.6.6.6'
  })

  it('cai para x-real-ip quando não há XFF', () => {
    const ip = extrairIpConfiavel(getter({ 'x-real-ip': '203.0.113.5' }))
    expect(ip).toBe('203.0.113.5')
  })

  it("retorna 'unknown' (balde único conservador) quando não há nenhum header de IP", () => {
    expect(extrairIpConfiavel(getter({}))).toBe('unknown')
  })
})

describe('checarRateLimit — chave secundária por e-mail (rotação de IP não escapa)', () => {
  beforeEach(() => {
    limparStore()
    _clock.now = vi.fn(() => T0)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('IP rotacionado MAS mesmo e-mail: além do teto é RECUSADO (teto por e-mail)', () => {
    const email = 'rep@empresa.com'
    // 5 submissões, cada uma de um IP diferente (rotação), mesmo e-mail
    for (let i = 0; i < 5; i++) {
      expect(checarRateLimit(`10.0.0.${i}`, email)).toEqual({ ok: true })
      registrarSubmissao(`10.0.0.${i}`, email)
    }
    // 6ª de um IP NOVO mas mesmo e-mail → recusada pela chave de e-mail
    const r = checarRateLimit('10.0.0.99', email)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/aguarde|solicitaç/i) // mensagem neutra PT-BR
  })

  it('e-mail normalizado (lower/trim): MESMO titular com caixa/espaços diferentes compartilha balde', () => {
    const base = '  Rep@Empresa.COM '
    const variante = 'rep@empresa.com'
    for (let i = 0; i < 5; i++) {
      registrarSubmissao(`10.0.1.${i}`, base)
    }
    expect(checarRateLimit('10.0.1.99', variante).ok).toBe(false)
  })

  it('e-mails distintos NÃO compartilham balde (sem falso positivo)', () => {
    for (let i = 0; i < 5; i++) {
      registrarSubmissao(`10.0.2.${i}`, 'a@empresa.com')
    }
    // outro e-mail, IP novo → permitido
    expect(checarRateLimit('10.0.2.99', 'b@empresa.com').ok).toBe(true)
  })

  it('regressão: o teto por IP continua valendo mesmo com e-mail (qualquer dos dois estoura → recusa)', () => {
    const ip = '203.0.113.50'
    for (let i = 0; i < 5; i++) {
      registrarSubmissao(ip, `dif${i}@empresa.com`) // mesmo IP, e-mails diferentes
    }
    // 6ª do MESMO IP (e-mail novo) → recusada pela chave de IP
    expect(checarRateLimit(ip, 'novo@empresa.com').ok).toBe(false)
  })
})
