/**
 * 008 — Paleta categórica de charts derivada dos tokens CSS 007.
 * Zero hex literal — toda cor lê hsl(var(--token)) em runtime.
 * design §2.2 / CA27 / RN16.
 */

/** Lê uma custom property CSS do :root como string "H S% L%". */
function lerToken(nome: string): string {
  if (typeof document === 'undefined') return '205 68% 33%' // SSR fallback
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim()
}

/** Converte "H S% L%" para { h, s, l } numéricos. */
function parsearHSL(hsl: string): { h: number; s: number; l: number } {
  const [h, s, l] = hsl.split(/\s+/).map((v) => parseFloat(v))
  return { h: h ?? 205, s: s ?? 68, l: l ?? 33 }
}

/**
 * Gera N cores categóricas por rotação de hue a partir de --primary → --accent.
 * Mantém L/C perceptualmente constantes para contraste AA equivalente.
 * Light: L mais baixo (saturado); Dark: L mais alto (luminoso).
 * Retorna array de strings "hsl(H, S%, L%)".
 */
export function coresCategoricas(n: number, tema: 'light' | 'dark'): string[] {
  const primaryToken = lerToken('--primary')
  const accentToken = lerToken('--accent')

  const primary = parsearHSL(primaryToken)
  const accent = parsearHSL(accentToken)

  if (n <= 0) return []
  if (n === 1) return [`hsl(${primary.h}, ${primary.s}%, ${tema === 'dark' ? primary.l + 20 : primary.l}%)`]

  // Âncora de L/S: light usa L da primary, dark eleva +22% p/ profundidade por luz
  const lBase = tema === 'dark' ? Math.min(primary.l + 22, 75) : primary.l
  const sBase = primary.s

  const colors: string[] = []
  for (let i = 0; i < n; i++) {
    // Distribui hues: começa em primary.h, termina perto de accent.h
    const t = n === 1 ? 0 : i / (n - 1)
    // Rotação: vai de primary.h até accent.h pelo caminho mais curto, girando
    let hDiff = accent.h - primary.h
    // Normaliza diff para [-180, 180]
    if (hDiff > 180) hDiff -= 360
    if (hDiff < -180) hDiff += 360
    const h = ((primary.h + t * hDiff) % 360 + 360) % 360
    colors.push(`hsl(${Math.round(h)}, ${sBase}%, ${lBase}%)`)
  }
  return colors
}
