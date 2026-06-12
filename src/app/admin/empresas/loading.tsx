/**
 * Loader comunicante — /admin/empresas (lista de cards de ação)
 * T-B16b / spec ux-ui §2.5 + §3
 * Espelha anatomia: cota + h1 + 3 cards ubm-machined (pares de duplicata)
 */
export default function AdminEmpresasLoading() {
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
        style={{ margin: '1rem 0 1.5rem' }}
      >
        <span className="ubm-sk-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>Carregando as empresas cadastradas…</span>
      </div>

      {/* ── 3 cards ubm-machined (pares de duplicata: nome + meta + botão Unir) ── */}
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
          {/* bloco esquerdo: nome Fraunces + meta similar */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="ubm-sk ubm-sk--title" style={{ width: '45%' }} />
            <div className="ubm-sk ubm-sk--text-sm" style={{ width: '30%' }} />
          </div>
          {/* botão Unir à direita */}
          <div className="ubm-sk ubm-sk--btn" style={{ flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}
