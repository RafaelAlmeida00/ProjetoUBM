/**
 * Loader comunicante — /app/dores (vitrine de dores publicadas)
 * T-B16b / spec ux-ui §2.3 + §3
 * Espelha anatomia: stamp-header + tabs + ubm-dor-grid com 6 ubm-sk-card
 */
export default function AppDoresLoading() {
  return (
    <div aria-busy="true" style={{ padding: 'clamp(1.25rem, 3vw, 2rem)', maxWidth: '70rem' }}>

      {/* ── Header: trail APP/DORES ── */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div className="ubm-sk ubm-sk--text-sm" aria-hidden="true" style={{ width: '2.5rem' }} />
        <div className="ubm-sk ubm-sk--text-sm" aria-hidden="true" style={{ width: '3rem' }} />
      </div>

      {/* ── Tabs (2 botões skeleton) ── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <div className="ubm-sk ubm-sk--btn" aria-hidden="true" />
        <div className="ubm-sk ubm-sk--btn" aria-hidden="true" />
      </div>

      {/* ── Faixa comunicante ── */}
      <div
        className="ubm-sk-status"
        role="status"
        aria-live="polite"
        style={{ marginBottom: '1.25rem' }}
      >
        <span className="ubm-sk-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>Reunindo as dores publicadas…</span>
      </div>

      {/* ── Grade: 6 ubm-sk-card (mesma grade responsiva do real) ── */}
      <div className="ubm-dor-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="ubm-sk-card" key={i} aria-hidden="true">
            {/* head: empresa (Fraunces) + chip de status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <div className="ubm-sk ubm-sk--title" style={{ width: '55%' }} />
              <div className="ubm-sk ubm-sk--pill" />
            </div>
            {/* descrição: 3 linhas */}
            <div className="ubm-sk ubm-sk--text" style={{ width: '100%' }} />
            <div className="ubm-sk ubm-sk--text" style={{ width: '95%' }} />
            <div className="ubm-sk ubm-sk--text" style={{ width: '70%' }} />
            {/* chips de cursos */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <div className="ubm-sk ubm-sk--chip" />
              <div className="ubm-sk ubm-sk--chip" />
            </div>
            {/* cota/data no rodapé */}
            <div className="ubm-sk ubm-sk--text-sm" style={{ width: '5rem' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
