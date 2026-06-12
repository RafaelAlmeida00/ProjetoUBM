import 'server-only'
import { Resend } from 'resend'

/**
 * Envio de e-mail server-side via Resend.
 * Segredos (server-only, fora do git — .env.local):
 *   RESEND_API_KEY  — chave da API Resend (obrigatória p/ enviar)
 *   RESEND_FROM     — remetente (default onboarding@resend.dev; sem domínio verificado o
 *                     Resend só entrega ao e-mail dono da conta).
 */
const FROM = process.env.RESEND_FROM ?? 'Plataforma UBM <onboarding@resend.dev>'

export async function enviarEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'RESEND_API_KEY ausente no servidor' }
  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })
    if (error) return { ok: false, error: String(error.message ?? error) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
