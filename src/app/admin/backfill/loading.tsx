/**
 * Loader comunicante — /admin/backfill (ferramentas de manutenção)
 * T-B16b / spec ux-ui §2.5 + §3
 * Espelha anatomia: cota + h1 + parágrafo explicativo + 3 cards ubm-machined
 */
export default function AdminBackfillLoading() {
  return (
    <div aria-busy="true" style={{ padding: 'clamp(1.25rem, 3vw, 2rem)', maxWidth: '70rem' }}>

      {/* ── Header: cota + título + parágrafo explicativo ── */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div className="ubm-sk ubm-sk--text-sm" aria-hidden="true" style={{ width: '5rem', marginBottom: '0.5rem' }} />
        <div className="ubm-sk ubm-sk--title" aria-hidden="true" style={{ width: '16rem', marginBottom: '0.6rem' }} />
        <div className="ubm-sk ubm-sk--text" aria-hidden="true" style={{ width: '80%', marginBottom: '0.35rem' }} />
        <div className="ubm-sk ubm-sk--text" aria-hidden="true" style={{ width: '60%' }} />
      </div>

      {/* ── Faixa comunicante ── */}
      <div
        className="ubm-sk-status"
        role="status"
        aria-live="polite"
        style={{ margin: '1rem 0 1.5rem' }}
      >
        <span className="ubm-sk-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>Preparando as ferramentas de manutenção…</span>
      </div>

      {/* ── 3 cards ubm-machined (grupos a fixar: cota + chips de grafias + botão Fixar) ── */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="ubm-machined"
          aria-hidden="true"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          {/* bloco esquerdo: cota "CANÔNICA SUGERIDA" + nome + chips de grafia */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="ubm-sk ubm-sk--text-sm" style={{ width: '9rem' }} />
            <div className="ubm-sk ubm-sk--title" style={{ width: '40%' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div className="ubm-sk ubm-sk--chip" />
              <div className="ubm-sk ubm-sk--chip" />
              <div className="ubm-sk ubm-sk--chip" />
            </div>
          </div>
          {/* botão Fixar à direita */}
          <div className="ubm-sk ubm-sk--btn" style={{ flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}
