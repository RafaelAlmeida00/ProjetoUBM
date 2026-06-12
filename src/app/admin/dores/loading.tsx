/**
 * Loader comunicante — /admin/dores (fila de moderação)
 * T-B16b / spec ux-ui §2.2 + §3
 * Espelha anatomia: stamp-header + contador + lista de ubm-dor-card
 */
export default function AdminDoresLoading() {
  return (
    <div aria-busy="true" style={{ padding: 'clamp(1.25rem, 3vw, 2rem)', maxWidth: '70rem' }}>

      {/* ── Header: trail ADMIN/DORES + chip modo moderação ── */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div className="ubm-sk ubm-sk--text-sm" aria-hidden="true" style={{ width: '3.5rem' }} />
        <div className="ubm-sk ubm-sk--text-sm" aria-hidden="true" style={{ width: '3rem' }} />
        <div className="ubm-sk ubm-sk--pill" aria-hidden="true" style={{ width: '9rem', marginLeft: 'auto' }} />
      </div>

      {/* ── Faixa comunicante (role=status deve ser o único com aria-live) ── */}
      <div
        className="ubm-sk-status"
        role="status"
        aria-live="polite"
        style={{ marginBottom: '1.5rem' }}
      >
        <span className="ubm-sk-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>Carregando a fila de moderação…</span>
      </div>

      {/* ── 4 ubm-sk-card (anatomia: título+status / 2 linhas texto / data) ── */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="ubm-sk-card" key={i} aria-hidden="true" style={{ marginBottom: '1rem' }}>
          {/* head: empresa (título) + chip de status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
            <div className="ubm-sk ubm-sk--title" style={{ width: '50%' }} />
            <div className="ubm-sk ubm-sk--pill" />
          </div>
          {/* descrição: 2 linhas */}
          <div className="ubm-sk ubm-sk--text" style={{ width: '100%' }} />
          <div className="ubm-sk ubm-sk--text" style={{ width: '80%' }} />
          {/* cota/data */}
          <div className="ubm-sk ubm-sk--text-sm" style={{ width: '6rem' }} />
        </div>
      ))}
    </div>
  )
}
