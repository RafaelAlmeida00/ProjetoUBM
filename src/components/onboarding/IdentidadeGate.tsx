'use client'
import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getMinhaIdentidade } from '@/lib/actions/onboarding'

/**
 * IdentidadeGate — RN21-24 / CA24-25 / architecture D.7
 *
 * Montado no AppShell (envolve todos os filhos de /app/*).
 * No mount, verifica se o usuário autenticado já tem papel (identidade).
 * Se não tiver → router.replace('/app/onboarding').
 *
 * Regras de segurança:
 * - Se pathname já é /app/onboarding → renderiza children diretamente (sem verificar,
 *   evita loop infinito de redirect).
 * - A verificação roda apenas 1 vez por montagem (ref idempotente).
 * - Renderiza children imediatamente — não bloqueia a UI com tela de carregamento.
 *   O redirect acontece em background assim que a Server Action responde.
 */
export function IdentidadeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const ran = useRef(false)

  useEffect(() => {
    // Já está no onboarding → não faz redirect (evita loop)
    if (pathname === '/app/onboarding') return
    // Idempotente: roda só 1 vez por montagem
    if (ran.current) return
    ran.current = true

    void (async () => {
      const { temPapel } = await getMinhaIdentidade()
      if (!temPapel) {
        router.replace('/app/onboarding')
      }
    })()
  }, [pathname, router])

  return <>{children}</>
}
