'use client'
import { OAuthButtons } from '@/components/auth/OAuthButtons'

// AC4/AC5/AC7 — login/cadastro via OAuth (e-mail do provedor; sem campo de e-mail).
export default function LoginPage() {
  const next =
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('next') ?? '/app')
      : '/app'

  return (
    <div className="ubm-login">
      <span className="ubm-cota">Acesso rápido</span>
      <h1>Entrar ou cadastrar</h1>
      <p>Use a conta que você já tem para continuar.</p>
      <div className="ubm-login-providers">
        <OAuthButtons next={next} showMicrosoft={false} />
      </div>
    </div>
  )
}
