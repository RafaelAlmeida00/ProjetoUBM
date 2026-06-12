/**
 * T11 + T12 — RED tests para lib/theming/paleta-core.ts
 *
 * T11: gerarTriade(seed) — cor-semente → tríade determinística light+dark
 * T12: validarAA(light, dark) — gate WCAG AA em todos os pares de uso
 *
 * Disciplina TDD: estes testes DEVEM FALHAR antes de existir o módulo.
 */
import { describe, it, expect } from 'vitest'
import { gerarTriade, validarAA, CONJUNTO_FECHADO } from '@/lib/theming/paleta-core'

// ─── Auxiliar: verifica que o valor é uma tripla HSL válida "H S% L%" ─────────
function isHslTripla(v: unknown): v is string {
  if (typeof v !== 'string') return false
  return /^\d{1,3}(\.\d+)?\s+\d{1,3}(\.\d+)?%\s+\d{1,3}(\.\d+)?%$/.test(v.trim())
}

// ─── T11 — gerarTriade ─────────────────────────────────────────────────────────
describe('T11 — gerarTriade(seed)', () => {
  const SEMENTE_AZUL = '205 68% 33%'
  const SEMENTE_AMARELO = '50 95% 55%'
  const SEMENTE_VERMELHO = '0 72% 45%'

  it('retorna um objeto com tokens_light e tokens_dark', () => {
    const result = gerarTriade(SEMENTE_AZUL)
    expect(result).toHaveProperty('tokens_light')
    expect(result).toHaveProperty('tokens_dark')
  })

  it('é determinística: mesmo input → mesmo output', () => {
    const a = gerarTriade(SEMENTE_AZUL)
    const b = gerarTriade(SEMENTE_AZUL)
    expect(a).toEqual(b)
  })

  it('emite SOMENTE as chaves do conjunto fechado', () => {
    const { tokens_light, tokens_dark } = gerarTriade(SEMENTE_AZUL)
    const keysLight = Object.keys(tokens_light)
    const keysDark = Object.keys(tokens_dark)
    keysLight.forEach((k) => expect(CONJUNTO_FECHADO).toContain(k))
    keysDark.forEach((k) => expect(CONJUNTO_FECHADO).toContain(k))
  })

  it('todos os valores são strings em formato HSL "H S% L%"', () => {
    const { tokens_light, tokens_dark } = gerarTriade(SEMENTE_AZUL)
    Object.values(tokens_light).forEach((v) =>
      expect(isHslTripla(v)).toBe(true),
    )
    Object.values(tokens_dark).forEach((v) =>
      expect(isHslTripla(v)).toBe(true),
    )
  })

  it('ring é sempre igual a primary (light)', () => {
    const { tokens_light } = gerarTriade(SEMENTE_AZUL)
    expect(tokens_light['ring']).toBe(tokens_light['primary'])
  })

  it('ring é sempre igual a primary (dark)', () => {
    const { tokens_dark } = gerarTriade(SEMENTE_AZUL)
    expect(tokens_dark['ring']).toBe(tokens_dark['primary'])
  })

  it('com marsala=true (default) preserva o acento marsala (próximo de 345)', () => {
    const { tokens_light } = gerarTriade(SEMENTE_AMARELO, { manterMarsala: true })
    // accent deve ter hue próximo de 345 (marsala) — não derivar da semente amarela
    const accentHue = parseFloat(tokens_light['accent'])
    // marsala = ~345 hue; tolerância de 20°
    expect(Math.abs(accentHue - 345) <= 20 || Math.abs(accentHue - 345 + 360) <= 20).toBe(true)
  })

  it('com marsala=false o acento deriva da semente (≠ marsala em hue)', () => {
    // semente bem distante de marsala → acento não deve ser marsala
    const { tokens_light } = gerarTriade(SEMENTE_AMARELO, { manterMarsala: false })
    const accentHue = parseFloat(tokens_light['accent'])
    // acento não deve ser marsala (345 ± 20)
    const isMarsala = Math.abs(accentHue - 345) <= 20 || Math.abs(accentHue - 345 + 360) <= 20
    expect(isMarsala).toBe(false)
  })

  it('semente diferente gera tríade diferente (primary light varia)', () => {
    const azul = gerarTriade(SEMENTE_AZUL)
    const vermelho = gerarTriade(SEMENTE_VERMELHO)
    expect(azul.tokens_light['primary']).not.toBe(vermelho.tokens_light['primary'])
  })
})

// ─── T12 — validarAA ──────────────────────────────────────────────────────────
describe('T12 — validarAA(light, dark)', () => {
  // Paleta ENCAIXE (azul UBM) — deve passar em light E dark
  const ENCAIXE_LIGHT: Record<string, string> = {
    primary: '205 68% 33%',
    'primary-foreground': '0 0% 100%',
    accent: '345 62% 30%',
    'accent-foreground': '0 0% 100%',
    ring: '205 68% 33%',
    secondary: '40 18% 88%',
    'secondary-foreground': '215 30% 18%',
  }
  const ENCAIXE_DARK: Record<string, string> = {
    primary: '205 75% 62%',
    'primary-foreground': '216 40% 10%',
    accent: '345 60% 60%',
    'accent-foreground': '216 40% 10%',
    ring: '205 75% 62%',
    secondary: '216 20% 20%',
    'secondary-foreground': '40 24% 92%',
  }

  // Paleta ruim: amarelo vibrante — primary sobre branco/tinta → quase certamente reprova
  const RUIM_LIGHT: Record<string, string> = {
    primary: '50 100% 60%',         // amarelo neon
    'primary-foreground': '0 0% 100%', // branco sobre amarelo neon → péssimo contraste
    accent: '50 100% 60%',
    'accent-foreground': '0 0% 100%',
    ring: '50 100% 60%',
    secondary: '50 100% 60%',
    'secondary-foreground': '0 0% 100%',
  }
  const RUIM_DARK: Record<string, string> = {
    primary: '50 100% 60%',
    'primary-foreground': '0 0% 100%',
    accent: '50 100% 60%',
    'accent-foreground': '0 0% 100%',
    ring: '50 100% 60%',
    secondary: '50 100% 60%',
    'secondary-foreground': '0 0% 100%',
  }

  it('paleta ENCAIXE (azul) aprovada em AA → { ok: true, falhas: [] }', () => {
    const result = validarAA(ENCAIXE_LIGHT, ENCAIXE_DARK)
    expect(result.ok).toBe(true)
    expect(result.falhas).toHaveLength(0)
  })

  it('paleta com contraste péssimo → { ok: false, falhas: [...] }', () => {
    const result = validarAA(RUIM_LIGHT, RUIM_DARK)
    expect(result.ok).toBe(false)
    expect(result.falhas.length).toBeGreaterThan(0)
  })

  it('mensagem de falha contém razão numérica e o tema (claro/escuro)', () => {
    const result = validarAA(RUIM_LIGHT, RUIM_DARK)
    const textos = result.falhas.join(' ')
    // deve conter um número de razão ":1" e um tema
    expect(textos).toMatch(/\d+\.\d+:1/)
    expect(textos.toLowerCase()).toMatch(/claro|escuro/)
  })

  it('cobre o par primary-foreground/primary em light', () => {
    const result = validarAA(RUIM_LIGHT, RUIM_DARK)
    const temPrimary = result.falhas.some((f) =>
      f.toUpperCase().includes('PRIMÁRIA') || f.toUpperCase().includes('PRIMARY'),
    )
    expect(temPrimary).toBe(true)
  })

  it('cobre todos os pares obrigatórios (primary, accent, ring, secondary em light+dark)', () => {
    // Verificamos indiretamente: paleta ruim (amarelo neon + branco) → múltiplos pares falham
    const result = validarAA(RUIM_LIGHT, RUIM_DARK)
    // primary-fg/primary e accent-fg/accent devem falhar (branco sobre amarelo = péssimo)
    expect(result.falhas.length).toBeGreaterThanOrEqual(2)
  })

  // ─── B-007-03 (IMP-2) — pares de texto sobre background ─────────────────────
  // Lacuna: accent e primary são usados como COR DE TEXTO direto sobre --background
  // (.ubm-link, .ubm-cota, .ubm-hero-title b, .ubm-node, etc.).
  // O gate anterior só verificava *-foreground sobre primary/accent.
  // Uma paleta cujo accent PASSE fg-sobre-accent mas FALHE como texto sobre background
  // deve ser detectada.

  it('[IMP-2] accent claro demais como texto sobre background (light) → { ok: false }', () => {
    // accent amarelo-ouro (L≈58%): tinta escura como foreground passa 4.5:1 sobre ele,
    // MAS o amarelo como texto sobre papel claro (L≈95%) tem contraste ~1.7:1 — ilegível.
    const lightAcentoClaro: Record<string, string> = {
      primary: '205 68% 33%',            // azul UBM — OK como texto sobre bg (passa)
      'primary-foreground': '0 0% 100%',
      accent: '50 90% 58%',              // amarelo-ouro claro — falha como texto sobre bg
      'accent-foreground': '215 40% 14%', // tinta escura sobre amarelo → passa fg/accent
      ring: '205 68% 33%',
      secondary: '40 18% 88%',
      'secondary-foreground': '215 30% 18%',
    }
    const darkOk: Record<string, string> = {
      primary: '205 75% 62%',
      'primary-foreground': '216 40% 10%',
      accent: '345 60% 60%',             // marsala — OK no dark
      'accent-foreground': '216 40% 10%',
      ring: '205 75% 62%',
      secondary: '216 20% 20%',
      'secondary-foreground': '40 24% 92%',
    }
    const result = validarAA(lightAcentoClaro, darkOk)
    // O gate ampliado deve detectar: accent (50 90% 58%) sobre background light (40 28% 95%)
    // é texto claro sobre fundo claro → ratio << 4.5
    expect(result.ok).toBe(false)
    const falhasStr = result.falhas.join(' ').toUpperCase()
    // A mensagem deve mencionar o par accent/background
    expect(falhasStr).toMatch(/ACENTO.*FUNDO|ACCENT.*BACKGROUND|TEXTO.*ACENTO.*FUNDO/i)
  })

  it('[IMP-2] primary escuro demais como texto sobre background (dark) → { ok: false, falha menciona PRIMÁRIA e FUNDO }', () => {
    // Cenário: primary muito escuro no dark (L≈20%) → branco como primary-foreground passa 4.5:1
    // sobre o primary (branco sobre escuro = bom), MAS primary como texto sobre background dark
    // (L≈9%) tem contraste próximo de 1:1 — texto quase invisível (ex: .ubm-hero-title b no dark).
    // NOTA: ring ≠ primary aqui para isolar o par primary/_background da falha de ring/_background.
    const darkPrimaryEscuro: Record<string, string> = {
      primary: '205 68% 20%',            // azul muito escuro no dark — texto invisível sobre bg dark
      'primary-foreground': '0 0% 100%', // branco sobre escuro → OK para primary-fg/primary
      accent: '345 60% 60%',
      'accent-foreground': '216 40% 10%',
      ring: '205 75% 62%',               // ring diferente de primary: ring passa no gate de foco
      secondary: '216 20% 20%',
      'secondary-foreground': '40 24% 92%',
    }
    const lightOk: Record<string, string> = {
      primary: '205 68% 33%',
      'primary-foreground': '0 0% 100%',
      accent: '345 62% 30%',
      'accent-foreground': '0 0% 100%',
      ring: '205 68% 33%',
      secondary: '40 18% 88%',
      'secondary-foreground': '215 30% 18%',
    }
    const result = validarAA(lightOk, darkPrimaryEscuro)
    // primary (L≈20%) sobre background dark (L≈9%) → contraste ~1.4:1, muito abaixo de 4.5
    expect(result.ok).toBe(false)
    const falhasStr = result.falhas.join(' ').toUpperCase()
    // Deve reportar especificamente o par primary/background (não apenas ring)
    expect(falhasStr).toMatch(/PRIMÁRIA.*FUNDO|TEXTO.*PRIMÁRIA/i)
  })

  it('[IMP-2] paleta ENCAIXE continua aprovada com gate ampliado', () => {
    // Os valores ENCAIXE já eram aprovados; o gate ampliado não deve quebrar.
    const result = validarAA(ENCAIXE_LIGHT, ENCAIXE_DARK)
    expect(result.ok).toBe(true)
    expect(result.falhas).toHaveLength(0)
  })

  it('[IMP-2] gerarTriade produz tríade que passa o gate ampliado (accent e primary como texto)', () => {
    // gerarTriade deve ajustar primary e accent para passarem TAMBÉM como texto sobre background
    const { tokens_light, tokens_dark } = gerarTriade('50 90% 55%', { manterMarsala: false })
    const result = validarAA(tokens_light, tokens_dark)
    expect(result.ok).toBe(true)
  })
})
