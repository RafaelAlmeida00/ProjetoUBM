'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getGateways } from '@/lib/factory'
import type { AuthUser } from '@/lib/proposal'

// AC7/RS1 — área logada mínima. Sem sessão → redireciona para /login (fail-closed).
export default function ContaPage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    getGateways()
      .auth.getCurrentUser()
      .then((u) => {
        if (!active) return
        if (!u) {
          router.replace('/login')
          return
        }
        setUser(u)
        setChecking(false)
      })
    return () => {
      active = false
    }
  }, [router])

  if (checking || !user) {
    return <p className="ubm-conta-checking">Verificando sua sessão…</p>
  }

  return (
    <div className="ubm-conta">
      <h1>Olá!</h1>
      <p>Você está logado como {user.email}.</p>
    </div>
  )
}
