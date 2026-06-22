interface KpiCardProps {
  rotulo: string
  valor: number | string
  /** Realce semântico: 'primary' = azul DOR, 'accent' = marsala TALENTO */
  realce?: 'primary' | 'accent'
  sublabel?: string
  children?: React.ReactNode
}

/**
 * Número-KPI da Bancada (design §6 / .ubm-kpi).
 * Fraunces para número, cota para rótulo, cor semântica azul/marsala.
 */
export function KpiCard({ rotulo, valor, realce = 'primary', sublabel, children }: KpiCardProps) {
  const corVar = realce === 'accent' ? 'var(--accent)' : 'var(--primary)'
  return (
    <dl className="ubm-kpi ubm-machined" style={{ padding: '1.1rem 1.2rem' }}>
      <dt className="ubm-cota ubm-cota--muted">{rotulo}</dt>
      <dd
        className="font-display"
        style={{
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          fontWeight: 600,
          color: `hsl(${corVar})`,
          lineHeight: 1,
          margin: '0.35rem 0 0',
        }}
      >
        {valor}
      </dd>
      {sublabel && (
        <dd className="ubm-cota ubm-cota--muted" style={{ marginTop: '0.25rem', fontSize: '0.68rem' }}>
          {sublabel}
        </dd>
      )}
      {children}
    </dl>
  )
}
