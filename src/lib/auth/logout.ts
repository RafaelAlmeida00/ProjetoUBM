import { createSupabaseBrowserClient, temSupabaseNoCliente } from '@/lib/supabase/client'

/**
 * Logout completo: encerra a sessão Supabase + limpa TODO o cache local do site
 * (localStorage/sessionStorage — ex.: rascunho de dor) + expira os cookies legíveis.
 * Os cookies httpOnly de auth caem no signOut server-side. Sempre redireciona à landing.
 */
export async function logoutCompleto(): Promise<void> {
  try {
    if (temSupabaseNoCliente()) {
      await createSupabaseBrowserClient().auth.signOut()
    }
  } catch {
    /* segue limpando mesmo se a sessão já tiver caído */
  }
  try {
    localStorage.clear()
  } catch {
    /* noop */
  }
  try {
    sessionStorage.clear()
  } catch {
    /* noop */
  }
  try {
    // Expira todos os cookies legíveis por JS (path raiz + domínio atual).
    for (const par of document.cookie.split(';')) {
      const nome = par.split('=')[0]?.trim()
      if (!nome) continue
      document.cookie = `${nome}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      document.cookie = `${nome}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${location.hostname}`
    }
  } catch {
    /* noop */
  }
  window.location.assign('/')
}
