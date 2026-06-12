'use client'
import type { ReactNode } from 'react'

// Um passo do wizard: 1 input por tela + microcopy (AC1/AC2).
export function WizardStep({
  label,
  microcopy,
  children,
}: {
  label: string
  microcopy: string
  children: ReactNode
}) {
  return (
    <div className="ubm-step">
      <h2 className="ubm-step-label">{label}</h2>
      <p className="ubm-step-microcopy">{microcopy}</p>
      <div className="ubm-step-field">{children}</div>
    </div>
  )
}
