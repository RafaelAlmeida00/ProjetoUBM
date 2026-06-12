/**
 * lib/theming/paleta-core.ts
 *
 * Módulo PURO (sem React, sem Supabase, sem efeitos colaterais).
 * T11: gerarTriade(seed) — cor-semente → tríade determinística light+dark
 * T12: validarAA(light, dark) — gate WCAG AA em todos os pares de uso
 *
 * Único módulo de geração (anti-drift): compartilhado por preview (client)
 * e Server Action (server). architecture.md §6.
 *
 * Dependência: culori (MIT, server-side / Edge — não vai ao bundle de cliente
 * via Server Actions).
 */
import {
  converter,
  wcagContrast,
  parse,
  formatHsl,
  type Oklch,
  type Hsl,
} from 'culori'

// ─── Conjunto fechado de chaves (RS-P2 / contracts/paleta.md §1) ──────────────
export const CONJUNTO_FECHADO = [
  'primary',
  'primary-foreground',
  'accent',
  'accent-foreground',
  'ring',
  'secondary',
  'secondary-foreground',
] as const

export type TokenKey = typeof CONJUNTO_FECHADO[number]
export type TokenMap = Record<string, string>

// ─── Constante ENCAIXE (fallback imutável = valores atuais do globals.css) ───
export const ENCAIXE_LIGHT: TokenMap = {
  primary: '205 68% 33%',
  'primary-foreground': '0 0% 100%',
  accent: '345 62% 30%',
  'accent-foreground': '0 0% 100%',
  ring: '205 68% 33%',
  secondary: '40 18% 88%',
  'secondary-foreground': '215 30% 18%',
}

export const ENCAIXE_DARK: TokenMap = {
  primary: '205 75% 62%',
  'primary-foreground': '216 40% 10%',
  accent: '345 60% 60%',
  'accent-foreground': '216 40% 10%',
  ring: '205 75% 62%',
  secondary: '216 20% 20%',
  'secondary-foreground': '40 24% 92%',
}

// ─── Marsala fixo (NC-6 / design §2.1) ───────────────────────────────────────
const MARSALA_HUE = 345
const MARSALA_LIGHT = '345 62% 30%'
const MARSALA_DARK = '345 60% 60%'

// ─── Conversores culori ───────────────────────────────────────────────────────
const toOklch = converter('oklch')
const toHsl = converter('hsl')

/**
 * Converte uma tripla HSL string "H S% L%" para objeto Hsl do culori.
 */
function parseTripla(hsl: string): Hsl | null {
  try {
    const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(hsl.trim())
    if (!m) return null
    const h = parseFloat(m[1])
    const s = parseFloat(m[2])
    const l = parseFloat(m[3])
    if (h < 0 || h > 360 || s < 0 || s > 100 || l < 0 || l > 100) return null
    return { mode: 'hsl', h, s: s / 100, l: l / 100 }
  } catch {
    return null
  }
}

/**
 * Formata objeto Hsl como string "H S% L%" para armazenamento/CSS.
 */
function formatarTripla(hsl: Hsl): string {
  const h = Math.round((hsl.h ?? 0) * 10) / 10
  const s = Math.round((hsl.s ?? 0) * 1000) / 10
  const l = Math.round((hsl.l ?? 0) * 1000) / 10
  return `${h} ${s}% ${l}%`
}

/**
 * Escolhe o foreground (branco ou tinta escura) com melhor contraste sobre a cor dada.
 */
function escolherForeground(bg: Hsl, claro: boolean): string {
  const branco: Hsl = { mode: 'hsl', h: 0, s: 0, l: 1 }
  const tintaEscura: Hsl = claro
    ? { mode: 'hsl', h: 215, s: 0.3, l: 0.18 }  // foreground escuro light
    : { mode: 'hsl', h: 216, s: 0.4, l: 0.10 }  // foreground dark

  const contrasteBranco = wcagContrast(bg, branco)
  const contrasteTinta = wcagContrast(bg, tintaEscura)

  // Branco vence em ambos os temas; tinta escura é específica por tema.
  if (contrasteBranco >= contrasteTinta) {
    return '0 0% 100%'
  }
  return claro ? '215 30% 18%' : '216 40% 10%'
}

/**
 * Ajusta a luminosidade de uma cor em OKLCH para garantir contraste mínimo
 * contra o background (branco/tinta). Retorna a cor ajustada em HSL string.
 */
function ajustarParaContraste(
  hue: number,
  chrome: number,
  claro: boolean,
  targetContraste: number,
): Hsl {
  // background: light = papel quente (L ~97%), dark = azul-meia-noite (L ~12%)
  const bgL = claro ? 0.97 : 0.12
  const bg: Hsl = { mode: 'hsl', h: claro ? 40 : 218, s: claro ? 0.28 : 0.32, l: bgL }

  // Tenta L decrescente (modo claro) ou crescente (modo escuro) até atingir contraste
  const step = claro ? -0.02 : 0.02
  let l = claro ? 0.35 : 0.60

  for (let i = 0; i < 50; i++) {
    const color: Oklch = { mode: 'oklch', l, c: chrome, h: hue }
    const hslColor = toHsl(color) as Hsl
    if (!hslColor) { l += step; continue }
    const c = wcagContrast(hslColor, bg)
    if (c >= targetContraste) return hslColor
    l += step
    if (l < 0.05 || l > 0.98) break
  }

  // Fallback: retorna a melhor tentativa
  const color: Oklch = { mode: 'oklch', l, c: chrome, h: hue }
  return toHsl(color) as Hsl || bg
}

export interface GerarTriadeOpcoes {
  /** Preservar acento marsala (default: true — NC-6 / design §2.1) */
  manterMarsala?: boolean
}

export interface TriadeResult {
  tokens_light: TokenMap
  tokens_dark: TokenMap
}

/**
 * T11 — gerarTriade(seed, opts?)
 *
 * cor-semente (HSL string "H S% L%") → tríade determinística light+dark.
 * - ring = primary sempre (design §2.1)
 * - marsala preservado por default (NC-6)
 * - emite SOMENTE chaves do CONJUNTO_FECHADO (RS-P2)
 * - valores no formato "H S% L%" prontos para persistência/CSS
 */
export function gerarTriade(
  sementeHsl: string,
  opts: GerarTriadeOpcoes = {},
): TriadeResult {
  const { manterMarsala = true } = opts

  const sementeParsed = parseTripla(sementeHsl)
  if (!sementeParsed) {
    // semente inválida → fallback ENCAIXE
    return { tokens_light: { ...ENCAIXE_LIGHT }, tokens_dark: { ...ENCAIXE_DARK } }
  }

  // Converte semente para OKLCH (espaço perceptualmente uniforme)
  const oklchSemente = toOklch(sementeParsed) as Oklch
  const hue = oklchSemente.h ?? 0
  const chrome = Math.min(oklchSemente.c ?? 0.12, 0.25)

  // ─── PRIMARY (light): ajustado para contraste AA ≥ 4.5 contra bg claro
  const primaryLight = ajustarParaContraste(hue, chrome, true, 4.5)
  const primaryLightStr = formatarTripla(primaryLight)

  // ─── PRIMARY (dark): ajustado para contraste AA ≥ 4.5 contra bg escuro
  const primaryDark = ajustarParaContraste(hue, chrome, false, 4.5)
  const primaryDarkStr = formatarTripla(primaryDark)

  // ─── PRIMARY-FOREGROUND
  const fgLight = escolherForeground(primaryLight, true)
  const fgDark = escolherForeground(primaryDark, false)

  // ─── ACCENT
  let accentLightStr: string
  let accentDarkStr: string

  if (manterMarsala) {
    // Preserva marsala (NC-6 / design §2.1 — default)
    accentLightStr = MARSALA_LIGHT
    accentDarkStr = MARSALA_DARK
  } else {
    // Deriva acento da semente: hue complementar (+150°) ou análogo (+30°)
    const hueAcento = (hue + 150) % 360
    const accentLight = ajustarParaContraste(hueAcento, chrome * 0.9, true, 4.5)
    const accentDark = ajustarParaContraste(hueAcento, chrome * 0.9, false, 4.5)
    accentLightStr = formatarTripla(accentLight)
    accentDarkStr = formatarTripla(accentDark)
  }

  // ─── ACCENT-FOREGROUND
  const accentLightParsed = parseTripla(accentLightStr)
  const accentDarkParsed = parseTripla(accentDarkStr)
  const accentFgLight = accentLightParsed ? escolherForeground(accentLightParsed, true) : '0 0% 100%'
  const accentFgDark = accentDarkParsed ? escolherForeground(accentDarkParsed, false) : '216 40% 10%'

  // ─── SECONDARY (opcional — só entra se mantiver AA ≥ 3:1 com secondary-foreground)
  // Derivação segura: tinta leve da semente (luminosidade alta no claro, baixa no escuro)
  const secondaryLightOklch: Oklch = { mode: 'oklch', l: 0.92, c: chrome * 0.15, h: hue }
  const secondaryDarkOklch: Oklch = { mode: 'oklch', l: 0.22, c: chrome * 0.15, h: hue }
  const secondaryLight = toHsl(secondaryLightOklch) as Hsl
  const secondaryDark = toHsl(secondaryDarkOklch) as Hsl

  const secFgLight: Hsl = { mode: 'hsl', h: 215, s: 0.3, l: 0.18 }
  const secFgDark: Hsl = { mode: 'hsl', h: 40, s: 0.24, l: 0.92 }

  const secContrastLight = secondaryLight ? wcagContrast(secondaryLight, secFgLight) : 0
  const secContrastDark = secondaryDark ? wcagContrast(secondaryDark, secFgDark) : 0

  const secondaryLightStr = (secondaryLight && secContrastLight >= 3)
    ? formatarTripla(secondaryLight)
    : '40 18% 88%'  // fallback neutro seguro
  const secondaryDarkStr = (secondaryDark && secContrastDark >= 3)
    ? formatarTripla(secondaryDark)
    : '216 20% 20%'  // fallback neutro seguro

  const secFgLightStr = '215 30% 18%'
  const secFgDarkStr = '40 24% 92%'

  return {
    tokens_light: {
      primary: primaryLightStr,
      'primary-foreground': fgLight,
      accent: accentLightStr,
      'accent-foreground': accentFgLight,
      ring: primaryLightStr,  // ring = primary sempre
      secondary: secondaryLightStr,
      'secondary-foreground': secFgLightStr,
    },
    tokens_dark: {
      primary: primaryDarkStr,
      'primary-foreground': fgDark,
      accent: accentDarkStr,
      'accent-foreground': accentFgDark,
      ring: primaryDarkStr,  // ring = primary sempre
      secondary: secondaryDarkStr,
      'secondary-foreground': secFgDarkStr,
    },
  }
}

// ─── T12 — validarAA ──────────────────────────────────────────────────────────

/** Pares fg/bg a verificar em cada tema (par, rácio mínimo, label PT-BR) */
type Par = {
  fg: TokenKey
  bg: TokenKey | '_background'  // _background = cor de fundo fixa do tema
  minRatio: number
  label: string
}

// Background fixo do tema (não está na tríade variável — é marca-base imutável)
// light: '40 28% 95%' | dark: '218 32% 9%'
const BG_LIGHT: Hsl = { mode: 'hsl', h: 40, s: 0.28, l: 0.95 }
const BG_DARK:  Hsl = { mode: 'hsl', h: 218, s: 0.32, l: 0.09 }

const PARES_TEXTO: Par[] = [
  { fg: 'primary-foreground',   bg: 'primary',      minRatio: 4.5, label: 'TEXTO SOBRE PRIMÁRIA'   },
  { fg: 'accent-foreground',    bg: 'accent',       minRatio: 4.5, label: 'TEXTO SOBRE ACENTO'     },
  { fg: 'secondary-foreground', bg: 'secondary',    minRatio: 4.5, label: 'TEXTO SOBRE SECUNDÁRIA' },
  // B-007-03 (IMP-2): accent e primary usados como COR DE TEXTO direta sobre o background da página
  // (.ubm-link, .ubm-cota, .ubm-hero-title b, .ubm-node, .charneira, .ubm-topbar-trail b, etc.)
  // RN5/CA4: AA em TODOS os usos — não apenas fg-sobre-botão.
  { fg: 'accent',   bg: '_background', minRatio: 4.5, label: 'TEXTO (ACENTO) SOBRE FUNDO'   },
  { fg: 'primary',  bg: '_background', minRatio: 4.5, label: 'TEXTO (PRIMÁRIA) SOBRE FUNDO' },
]

// ring = cor de foco visível sobre o background → contraste UI ≥ 3:1
const PARES_UI: Par[] = [
  { fg: 'ring', bg: '_background', minRatio: 3, label: 'FOCO (RING) SOBRE FUNDO' },
]

export interface ValidarAAResult {
  ok: boolean
  falhas: string[]
}

/**
 * T12 — validarAA(light, dark)
 *
 * WCAG AA em todos os pares de uso (texto ≥ 4.5:1, UI ≥ 3:1), em light E dark.
 * Retorna { ok, falhas[] } — falhas é lista humanizável em PT-BR.
 *
 * architecture.md §6 / security.md RS-P5/P6/P7 / tasks.md T12.
 */
export function validarAA(
  light: Record<string, string>,
  dark: Record<string, string>,
): ValidarAAResult {
  const falhas: string[] = []

  function verificarPar(
    tokens: Record<string, string>,
    par: Par,
    tema: 'claro' | 'escuro',
  ) {
    const fgStr = tokens[par.fg]
    if (!fgStr) return  // token fg ausente — não falha (opcional)

    const fgParsed = parseTripla(fgStr)
    if (!fgParsed) return  // formato inválido — passa (banco já rejeita)

    // bg: pode ser um token da tríade ou o background fixo do tema (_background)
    let bgParsed: Hsl | null
    if (par.bg === '_background') {
      bgParsed = tema === 'claro' ? BG_LIGHT : BG_DARK
    } else {
      const bgStr = tokens[par.bg as TokenKey]
      if (!bgStr) return  // token bg ausente — não falha
      bgParsed = parseTripla(bgStr)
      if (!bgParsed) return
    }

    const ratio = wcagContrast(fgParsed, bgParsed)
    const ratioRound = Math.round(ratio * 100) / 100

    if (ratio < par.minRatio) {
      falhas.push(
        `${par.label} ${ratioRound}:1 < ${par.minRatio} (${tema})`,
      )
    }
  }

  const todosOsPares = [...PARES_TEXTO, ...PARES_UI]

  todosOsPares.forEach((par) => {
    verificarPar(light, par, 'claro')
    verificarPar(dark, par, 'escuro')
  })

  return {
    ok: falhas.length === 0,
    falhas,
  }
}
