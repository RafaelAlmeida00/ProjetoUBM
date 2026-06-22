import { formatarFrescor, estaStale } from '@/lib/analytics/frescor'

interface FrescorBadgeProps {
  atualizado_em: string | null | undefined
}

/**
 * Carimbo "atualizado há X min" (design §3 / CA10).
 * Renderiza SOMENTE para Velocidade B (B3/R1).
 * Não renderiza nada quando atualizado_em é null (Velocidade A — CA3).
 */
export function FrescorBadge({ atualizado_em }: FrescorBadgeProps) {
  const texto = formatarFrescor(atualizado_em)
  if (!texto) return null

  const stale = estaStale(atualizado_em)
  const dataAbsoluta = atualizado_em
    ? new Date(atualizado_em).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : ''

  return (
    <span
      role="status"
      className={`ubm-data-stamp${stale ? ' ubm-data-stamp--stale' : ''}`}
      aria-label={`Atualizado em ${dataAbsoluta}`}
      title={`Atualizado em ${dataAbsoluta}`}
    >
      {/* ícone de relógio (decorativo — texto carrega o significado) */}
      <svg
        aria-hidden="true"
        width="1em"
        height="1em"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 5v3.5l2 1.5" strokeLinecap="round" />
      </svg>
      <span className="ubm-cota ubm-cota--muted">ATUALIZADO {texto}</span>
    </span>
  )
}
