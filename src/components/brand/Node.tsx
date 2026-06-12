// Símbolo UBM (dois quadrados a 45° entrelaçados) como SVG inline (currentColor).
// Usado como marca-d'água, rotor, spinner e bullet. NÃO é o logo (logo = PNG); é o motivo.
export function Node({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect x="22" y="22" width="56" height="56" transform="rotate(45 50 50)" />
      <rect x="22" y="22" width="56" height="56" />
      <rect x="40" y="40" width="20" height="20" transform="rotate(45 50 50)" />
    </svg>
  )
}
