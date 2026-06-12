/**
 * Loader comunicante — /admin/usuarios (tabela de usuários e papéis)
 * T-B16b / spec ux-ui §2.1 + §3
 * Espelha anatomia: cota + h1 + ubm-machined com tabela 4 colunas
 */
export default function AdminUsuariosLoading() {
  return (
    <div aria-busy="true" style={{ padding: 'clamp(1.25rem, 3vw, 2rem)', maxWidth: '70rem' }}>

      {/* ── Header: cota + título ── */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div className="ubm-sk ubm-sk--text-sm" aria-hidden="true" style={{ width: '5rem', marginBottom: '0.5rem' }} />
        <div className="ubm-sk ubm-sk--title" aria-hidden="true" style={{ width: '14rem' }} />
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
        <span>Buscando usuários e papéis…</span>
      </div>

      {/* ── Tabela fantasma dentro de ubm-machined ── */}
      <div className="ubm-machined" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr aria-hidden="true" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
              {/* 4 colunas: e-mail 30% / papéis 2x chip / admin pill / ação */}
              {[30, 12, 12, 18, 8].map((w, i) => (
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
                  <div className="ubm-sk ubm-sk--text" style={{ width: '70%' }} />
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div className="ubm-sk ubm-sk--chip" />
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div className="ubm-sk ubm-sk--chip" />
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div className="ubm-sk ubm-sk--pill" style={{ width: '5rem' }} />
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div className="ubm-sk ubm-sk--text-sm" style={{ width: '2rem' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
