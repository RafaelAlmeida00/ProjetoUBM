'use client'

// Progresso disfarçado (AC1) — acessível via role="progressbar".
export function ProgressIndicator({ value }: { value: number }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100)
  return (
    <div
      className="ubm-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Progresso"
    >
      <div className="ubm-progress-bar" style={{ width: `${pct}%` }} />
    </div>
  )
}
