/**
 * Loader comunicante — /admin/auditoria (trilha de auditoria)
 * T-B16b / spec ux-ui §2.1 + §3
 * Espelha anatomia: cota + h1 + parágrafo + ubm-machined com tabela 5 colunas
 */
export default function AdminAuditoriaLoading() {
  return (
    <div aria-busy="true" style={{ padding: 'clamp(1.25rem, 3vw, 2rem)', maxWidth: '70rem' }}>

      {/* ── Header: cota + título + parágrafo ── */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div className="ubm-sk ubm-sk--text-sm" aria-hidden="true" style={{ width: '5rem', marginBottom: '0.5rem' }} />
        <div className="ubm-sk ubm-sk--title" aria-hidden="true" style={{ width: '16rem', marginBottom: '0.5rem' }} />
        <div className="ubm-sk ubm-sk--text" aria-hidden="true" style={{ width: '60%' }} />
      </div>

      {/* ── Faixa comunicante ── */}
      <div
        className="ubm-sk-status"
        role="status"
        aria-live="polite"
        style={{ margin: '1rem 0 1.25rem' }}
      >
        <span className="ubm-sk-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>Abrindo a trilha de auditoria…</span>
      </div>

      {/* ── Tabela fantasma — 5 colunas: op / tabela / ator / quando / chevron ── */}
      <div className="ubm-machined" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr aria-hidden="true" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
              {[8, 14, 30, 18, 5].map((w, i) => (
                <th key={i} style={{ padding: '0.65rem 1rem', textAlign: 'left' }}>
                  <div className="ubm-sk ubm-sk--text-sm" style={{ width: `${w}%` }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, rowIdx) => (
              <tr
                key={rowIdx}
                aria-hidden="true"
                style={{ borderBottom: '1px solid hsl(var(--border))' }}
              >
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div className="ubm-sk ubm-sk--chip" style={{ width: '3.5rem' }} />
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div className="ubm-sk ubm-sk--text" style={{ width: '80%' }} />
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div className="ubm-sk ubm-sk--text" style={{ width: '75%' }} />
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div className="ubm-sk ubm-sk--text" style={{ width: '85%' }} />
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div className="ubm-sk ubm-sk--text-sm" style={{ width: '1rem' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
