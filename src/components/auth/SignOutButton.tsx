'use client'
import { useState } from 'react'
import { logoutCompleto } from '@/lib/auth/logout'

// Logout: encerra a sessão + limpa cache local + cookies, e volta para a landing.
export function SignOutButton() {
  const [saindo, setSaindo] = useState(false)

  const sair = async () => {
    setSaindo(true)
    await logoutCompleto()
  }

  return (
    <button
      type="button"
      className="ubm-header-signout"
      onClick={sair}
      disabled={saindo}
      aria-label="Sair da conta"
    >
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
  )
}
