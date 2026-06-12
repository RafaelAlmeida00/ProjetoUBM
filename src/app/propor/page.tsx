'use client'
import { ProporSubmitForm } from '@/components/propor/ProporSubmitForm'

/**
 * T6 — /propor (submit real, fecha o e2e da landing).
 * O wizard passa a submeter de verdade via submeterDorLanding.
 * Substituí o Wizard mock pelo ProporSubmitForm com wiring real.
 */
export default function ProporPage() {
  return (
    <div className="ubm-propor">
      <ProporSubmitForm />
    </div>
  )
}
