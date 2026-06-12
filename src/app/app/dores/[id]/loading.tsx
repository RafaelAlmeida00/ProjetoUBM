/**
 * Loader comunicante — /app/dores/[id] (detalhe de dor)
 * T-B16b / spec ux-ui §2.4 + §3
 * Preenche só .ubm-shell-main (o rail do shell é persistente, não recarrega).
 * Espelha anatomia: trail/cota + empresa Fraunces + status + descrição 4 linhas + chips de cursos
 */
export default function AppDoresIdLoading() {
  return (
    <div
      aria-busy="true"
      style={{ padding: 'clamp(1.25rem, 3vw, 2rem)', maxWidth: '70rem' }}
    >
      {/* ── Faixa comunicante no topo ── */}
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
        <span>Abrindo esta dor…</span>
      </div>

      {/* ── Trail/cota ── */}
      <div className="ubm-sk ubm-sk--text-sm" aria-hidden="true" style={{ width: '10rem', marginBottom: '0.75rem' }} />

      {/* ── Empresa (Fraunces, título) + chip de status ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div className="ubm-sk ubm-sk--title" aria-hidden="true" style={{ width: '40%', height: '1.8rem' }} />
        <div className="ubm-sk ubm-sk--pill" aria-hidden="true" />
      </div>

      {/* ── Descrição: 4 linhas ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        <div className="ubm-sk ubm-sk--text" aria-hidden="true" style={{ width: '100%' }} />
        <div className="ubm-sk ubm-sk--text" aria-hidden="true" style={{ width: '100%' }} />
        <div className="ubm-sk ubm-sk--text" aria-hidden="true" style={{ width: '90%' }} />
        <div className="ubm-sk ubm-sk--text" aria-hidden="true" style={{ width: '60%' }} />
      </div>

      {/* ── Chips de cursos ── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <div className="ubm-sk ubm-sk--chip" aria-hidden="true" />
        <div className="ubm-sk ubm-sk--chip" aria-hidden="true" />
        <div className="ubm-sk ubm-sk--chip" aria-hidden="true" />
      </div>

      {/* ── Itens de anexo (2 linhas skeleton) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div className="ubm-sk" aria-hidden="true" style={{ height: '3rem', borderRadius: 'var(--radius)' }} />
        <div className="ubm-sk" aria-hidden="true" style={{ height: '3rem', borderRadius: 'var(--radius)' }} />
      </div>
    </div>
  )
}
