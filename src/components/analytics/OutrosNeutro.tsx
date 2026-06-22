/**
 * Peça "Outros (N)" — grupo k-anônimo suprimido (design §5.1 / CA16).
 * Placa neutra e digna (não esmaecida-como-erro). Explica o porquê.
 */
export function OutrosNeutro({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <div
      className="ubm-podium-others ubm-machined"
      style={{
        padding: '0.65rem 1rem',
        marginTop: '0.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        opacity: 0.85,
      }}
      aria-label={`Outros ${count} participantes — grupos com menos de 5 pessoas não aparecem individualmente, para proteger a privacidade.`}
    >
      {/* ícone de grupo */}
      <svg
        aria-hidden="true"
        width="1.1em"
        height="1.1em"
        viewBox="0 0 16 16"
        fill="currentColor"
        style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}
      >
        <path d="M11 7a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm-9 8s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H2Zm12 0h-1.5c.326-.5.5-1.05.5-1.5 0-1.376-.69-2.645-1.842-3.5C12.484 9.65 14 10.83 14 13c0 .5-.174 1.25-.5 2H14Z" />
      </svg>
      <div>
        <span className="ubm-cota ubm-cota--muted">
          Outros ({count}) participantes
        </span>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>
          Grupos com menos de 5 pessoas não aparecem individualmente, para proteger a privacidade.
        </p>
      </div>
    </div>
  )
}
