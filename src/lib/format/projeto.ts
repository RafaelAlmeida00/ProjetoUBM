/**
 * Rótulo visual de um projeto/dor: "Título — Empresa".
 * O título é a identidade VISUAL (o id continua sendo a identidade lógica).
 * Fallback gracioso: sem título → só a empresa; sem empresa → só o título; nenhum → "Projeto".
 */
export function rotuloProjeto(
  titulo: string | null | undefined,
  empresa: string | null | undefined,
): string {
  const t = titulo?.trim()
  const e = empresa?.trim()
  if (t && e) return `${t} — ${e}`
  return t || e || 'Projeto'
}
