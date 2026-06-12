import Link from 'next/link'
import { OAuthButtons } from './OAuthButtons'

// Quick-login do hero, no "losango de encaixe" (ponto de maior valor). Destaque a Google/Microsoft.
export function QuickLogin() {
  return (
    <aside className="ubm-quicklogin ubm-machined">
      <div className="ubm-quicklogin-head">
        <span className="ubm-cota">Acesso rápido</span>
      </div>
      <OAuthButtons next="/app" showMicrosoft={false} />
      <div className="ubm-quicklogin-or">ou</div>
      <Link href="/login" className="ubm-link">
        Entrar sem propor uma dor
      </Link>
      <p className="ubm-quicklogin-note">
        Você entra com a conta que já usa — leva segundos.
      </p>
    </aside>
  )
}
