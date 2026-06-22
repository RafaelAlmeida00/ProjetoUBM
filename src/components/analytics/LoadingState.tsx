interface LoadingStateProps {
  mensagem?: string
}

/**
 * Estado de carregamento on-brand (design §7 — loader comunicante).
 * .ubm-skeleton em forma de silhueta + microcopy "Preparando os números...".
 */
export function LoadingState({ mensagem = 'Preparando os números…' }: LoadingStateProps) {
  return (
    <div aria-busy="true" aria-label={mensagem} className="ubm-chart-skeleton">
      {/* Silhueta de 3 barras */}
      <div className="ubm-skeleton" style={{ height: '2rem', marginBottom: '0.5rem', borderRadius: '4px' }} />
      <div className="ubm-skeleton" style={{ height: '2rem', marginBottom: '0.5rem', borderRadius: '4px', width: '80%' }} />
      <div className="ubm-skeleton" style={{ height: '2rem', borderRadius: '4px', width: '60%' }} />
      <p className="ubm-cota ubm-cota--muted" style={{ marginTop: '1rem' }}>{mensagem}</p>
    </div>
  )
}
