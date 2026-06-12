'use server'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { enviarVerificacao } from '@/lib/email/verificacao'

function baseUrl(h: Headers): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

/**
 * Server Action: reenvia o e-mail de verificação (forçado) via Resend.
 * Emite o token (0006) e envia o link. Mapeia erros (rate-limit) em PT-BR.
 */
export async function emitirVerificacao(): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const h = await headers()
    const r = await enviarVerificacao(supabase, baseUrl(h), true)
    if (!r.ok) {
      // Log server-side da causa real (o usuário vê só a msg genérica)
      console.error('[emitirVerificacao] falha ao enviar:', r.error)
      if (/rate|limite/i.test(r.error ?? '')) {
        return { ok: false, error: 'Aguarde alguns minutos para reenviar.' }
      }
      // DEV: anexa a causa real à mensagem p/ diagnóstico rápido (removido em produção)
      const detalhe =
        process.env.NODE_ENV !== 'production' && r.error ? ` [diagnóstico: ${r.error}]` : ''
      return { ok: false, error: `Não foi possível enviar o e-mail. Tente novamente.${detalhe}` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível enviar o e-mail. Tente novamente.' }
  }
}
