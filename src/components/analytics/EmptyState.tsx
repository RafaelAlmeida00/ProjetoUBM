interface EmptyStateProps {
  titulo: string
  mensagem: string
  cta?: { label: string; href: string }
}

/**
 * Estado vazio on-brand (design §5/§6 — CA13).
 * Usa .ubm-empty + nó vazado + microcopy humanizado. Nunca "No data".
 */
export function EmptyState({ titulo, mensagem, cta }: EmptyStateProps) {
  return (
    <div className="ubm-empty">
      <div className="ubm-empty-node" aria-hidden="true" />
      <p className="ubm-empty-title">{titulo}</p>
      <p className="ubm-empty-msg">{mensagem}</p>
      {cta && (
        <a href={cta.href} className="ubm-btn ubm-btn-secondary" style={{ marginTop: '1rem' }}>
          {cta.label}
        </a>
      )}
    </div>
  )
}
