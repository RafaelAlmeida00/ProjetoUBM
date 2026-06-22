/**
 * 008 — Carimbo "atualizado há X min" PT-BR (design §3).
 * Só Velocidade B (B3/R1); B1/B2 nunca chamam esta função.
 */

/**
 * Formata um timestamp ISO para string relativa PT-BR UPPERCASE.
 * Retorna null se atualizado_em for null/undefined.
 */
export function formatarFrescor(atualizado_em: string | null | undefined): string | null {
  if (!atualizado_em) return null

  const agora = Date.now()
  const atualizado = new Date(atualizado_em).getTime()
  const diffMs = agora - atualizado
  const diffMin = Math.floor(diffMs / 60_000)
  const diffH = Math.floor(diffMs / 3_600_000)
  const diffDias = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'AGORA HÁ POUCO'
  if (diffMin < 60) return `HÁ ${diffMin} MIN`
  if (diffH < 24) return `HÁ ${diffH} H`
  if (diffDias === 1) return 'ONTEM'
  return `HÁ ${diffDias} DIAS`
}

/**
 * Retorna true se o timestamp está "stale" (>36h) — muda o carimbo para --stale (warning).
 */
export function estaStale(atualizado_em: string | null | undefined): boolean {
  if (!atualizado_em) return false
  const diffH = (Date.now() - new Date(atualizado_em).getTime()) / 3_600_000
  return diffH > 36
}
