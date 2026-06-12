'use client'
import { PRIVACY_POLICY_URL } from '@/lib/config'

interface ConsentGateProps {
  checked: boolean
  onChange: (value: boolean) => void
}

// AC8/RN5/RS4 — consentimento obrigatório + link EXTERNO da política.
export function ConsentGate({ checked, onChange }: ConsentGateProps) {
  return (
    <div className="ubm-consent">
      <label className="ubm-consent-label">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />{' '}
        Concordo com o tratamento dos meus dados conforme a{' '}
        <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
          política de privacidade
        </a>
        .
      </label>
    </div>
  )
}
