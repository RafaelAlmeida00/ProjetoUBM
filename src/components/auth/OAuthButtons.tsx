'use client'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getGateways } from '@/lib/factory'
import type { OAuthProvider } from '@/lib/auth/auth-gateway'
import { useModal } from '@/components/modal/ModalProvider'
import { CommunicatingLoader } from '@/components/modal/CommunicatingLoader'
import { GoogleIcon, MicrosoftIcon } from '@/components/brand/ProviderIcons'
import { createSupabaseBrowserClient, temSupabaseNoCliente } from '@/lib/supabase/client'

// AC4/AC5/AC7 — login OAuth (e-mail vem do provedor; sem campo de e-mail). Reutilizado no hero e em /login.
export function OAuthButtons({ next = '/app', showMicrosoft = true }: { next?: string; showMicrosoft?: boolean }) {
  const router = useRouter()
  const { show, hide } = useModal()
  const auth = useMemo(() => getGateways().auth, [])

  const entrar = async (provider: OAuthProvider) => {
    show('Entrando', <CommunicatingLoader message="Protocolando seu acesso com segurança…" />)
    // Com Supabase configurado → OAuth real (redireciona ao provedor e volta em /auth/callback).
    if (temSupabaseNoCliente()) {
      const supabase = createSupabaseBrowserClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      await supabase.auth.signInWithOAuth({
        provider: provider === 'microsoft' ? 'azure' : 'google',
        options: { redirectTo },
      })
      return // o navegador é redirecionado ao provedor
    }
    // Sem env (dev/test) → fluxo mock determinístico (001).
    try {
      await auth.signInWithProvider(provider)
      router.push(next)
    } finally {
      hide()
    }
  }

  return (
    <div className="ubm-quicklogin-providers">
      <button type="button" className="ubm-oauth-btn" aria-label="Entrar com Google" onClick={() => entrar('google')}>
        <GoogleIcon /> <span>Continuar com Google</span>
      </button>
      {showMicrosoft && (
        <button type="button" className="ubm-oauth-btn" aria-label="Entrar com Microsoft" onClick={() => entrar('microsoft')}>
          <MicrosoftIcon /> <span>Continuar com Microsoft</span>
        </button>
      )}
    </div>
  )
}
