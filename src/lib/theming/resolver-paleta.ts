/**
 * lib/theming/resolver-paleta.ts
 *
 * T14 — Resolução SSR da paleta ativa + geração do CSS inline.
 *
 * - resolvePalette(uid): chama resolver_paleta(p_uid) sob RLS;
 *   fallback ENCAIXE se RPC indisponível (RS-P16 / never-without-color)
 * - paletteToCss(light, dark): gera :root{} + [data-theme="dark"]{}
 *   com SOMENTE as chaves do conjunto fechado (RS-P2);
 *   valor destoante → fallback ENCAIXE (fail-closed);
 *   nome/semente nunca entram (RS-P4)
 *
 * contracts/paleta.md §2 / §7 / architecture.md §3.1
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  CONJUNTO_FECHADO,
  ENCAIXE_LIGHT,
  ENCAIXE_DARK,
  type TokenMap,
} from './paleta-core'

// ─── Tipo retornado pela RPC (e pela borda) ────────────────────────────────────
export interface PaletteTokens {
  tokens_light: TokenMap
  tokens_dark: TokenMap
}

// ─── Regex de validação HSL (mesma do CHECK no banco) ─────────────────────────
const HSL_RE = /^\d{1,3}(\.\d+)?\s+\d{1,3}(\.\d+)?%\s+\d{1,3}(\.\d+)?%$/

function isHslValido(v: unknown): v is string {
  return typeof v === 'string' && HSL_RE.test(v.trim())
}

/**
 * T14 — resolvePalette(uid)
 *
 * Chama resolver_paleta(p_uid) via Supabase client server-side (sob RLS).
 * uid = null → anônimo → oficial ativa.
 * Indisponível / erro → constante ENCAIXE (fail-closed, RS-P16).
 */
export async function resolvePalette(uid: string | null): Promise<PaletteTokens> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('resolver_paleta', { p_uid: uid })

    if (error || !data || !Array.isArray(data) || data.length === 0) {
      return { tokens_light: { ...ENCAIXE_LIGHT }, tokens_dark: { ...ENCAIXE_DARK } }
    }

    const row = data[0] as { tokens_light: unknown; tokens_dark: unknown }
    const light = (typeof row.tokens_light === 'object' && row.tokens_light !== null)
      ? row.tokens_light as Record<string, unknown>
      : {}
    const dark = (typeof row.tokens_dark === 'object' && row.tokens_dark !== null)
      ? row.tokens_dark as Record<string, unknown>
      : {}

    return {
      tokens_light: _sanitizarTokens(light),
      tokens_dark: _sanitizarTokens(dark),
    }
  } catch {
    // Qualquer falha → ENCAIXE (nunca-sem-cor — CA10)
    return { tokens_light: { ...ENCAIXE_LIGHT }, tokens_dark: { ...ENCAIXE_DARK } }
  }
}

/**
 * T14 — paletteToCss(light, dark)
 *
 * Gera string CSS:
 *   :root { --primary: …; --primary-foreground: …; … }
 *   [data-theme="dark"] { --primary: …; … }
 *
 * Regras:
 * - Emite SOMENTE chaves do CONJUNTO_FECHADO (RS-P2)
 * - Re-valida cada valor HSL; destoante → fallback ENCAIXE (fail-closed)
 * - nome/semente nunca aparecem (RS-P4)
 *
 * contracts/paleta.md §7
 */
export function paletteToCss(
  light: Record<string, string>,
  dark: Record<string, string>,
): string {
  const lightLines = _buildCssVars(light, ENCAIXE_LIGHT)
  const darkLines = _buildCssVars(dark, ENCAIXE_DARK)

  return `:root{${lightLines}}[data-theme="dark"]{${darkLines}}`
}

// ─── helpers privados ─────────────────────────────────────────────────────────

/**
 * Para cada chave do conjunto fechado, emite --key: value; .
 * Se o valor for inválido, usa o fallback ENCAIXE para aquela chave.
 */
function _buildCssVars(
  tokens: Record<string, string>,
  fallback: TokenMap,
): string {
  return CONJUNTO_FECHADO
    .map((key) => {
      const val = tokens[key]
      const safe = isHslValido(val) ? val : (fallback[key] ?? ENCAIXE_LIGHT[key] ?? '')
      return `--${key}:${safe};`
    })
    .join('')
}

// ─── Favicon por paleta (azul/marsala) ─────────────────────────────────────────
// O ícone da aba do navegador reflete a paleta ATIVA. Como a paleta não expõe nome
// (RS-P4), escolhemos pela MATIZ do --primary: azul UBM (~205) vs marsala (~345),
// por menor distância circular de matiz. Fail-safe → azul (marca padrão).
export const ICON_AZUL = '/ubm-icon-azul.png'
export const ICON_MARSALA = '/ubm-icon-marsala.png'

export function pickPaletteIconHref(primaryHsl: string): string {
  const hue = _parseHue(primaryHsl)
  if (hue === null) return ICON_AZUL
  return _hueDist(hue, 345) < _hueDist(hue, 205) ? ICON_MARSALA : ICON_AZUL
}

function _parseHue(hsl: unknown): number | null {
  if (typeof hsl !== 'string') return null
  const m = /^\s*(\d{1,3}(?:\.\d+)?)\s+\d/.exec(hsl)
  if (!m) return null
  const h = parseFloat(m[1])
  return Number.isFinite(h) ? ((h % 360) + 360) % 360 : null
}

function _hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * Sanitiza tokens vindos do banco:
 * - Mantém apenas chaves do conjunto fechado
 * - Valida formato HSL; valor inválido → fallback ENCAIXE
 */
function _sanitizarTokens(raw: Record<string, unknown>): TokenMap {
  const result: TokenMap = {}
  for (const key of CONJUNTO_FECHADO) {
    const val = raw[key]
    result[key] = isHslValido(val) ? val : (ENCAIXE_LIGHT[key] ?? '')
  }
  return result
}
