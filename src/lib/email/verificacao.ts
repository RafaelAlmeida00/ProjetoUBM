import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarEmail } from './resend'

/** Escapa texto p/ interpolar com segurança no HTML do e-mail. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

/** Template on-brand UBM (azul #1C5E91) do e-mail de verificação. */
function htmlVerificacao(nome: string, link: string): string {
  const saudacao = nome ? `Olá, ${esc(nome)}` : 'Olá'
  const href = esc(link)
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(28,94,145,.12)">
        <tr><td style="background:#1C5E91;padding:20px 28px;color:#fff;font-size:18px;font-weight:600">Plataforma UBM</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">${saudacao}!</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6">
            Confirme sua conta para liberar sua dor na vitrine pública. Basta clicar no botão abaixo:
          </p>
          <p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;background:#1C5E91;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600">Verificar minha conta</a></p>
          <p style="margin:0 0 4px;font-size:13px;color:#64748b">Ou copie e cole este link no navegador:</p>
          <p style="margin:0 0 20px;font-size:13px;color:#1C5E91;word-break:break-all">${href}</p>
          <p style="margin:0;font-size:13px;color:#94a3b8">O link expira em 60 minutos. Se você não solicitou, ignore este e-mail.</p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;font-size:12px;color:#94a3b8">Universidade de Barra Mansa — Plataforma UBM</td></tr>
      </table>
    </td></tr>
  </table></body></html>`
}

/**
 * Decide (via RPC solicitar_verificacao_email) se deve enviar o e-mail de verificação
 * e, se sim, envia via Resend. Idempotente: não reenvia se já verificado / token pendente
 * (a menos que `forcar`). Não lança — retorna o resultado (caller decide UX).
 */
export async function enviarVerificacao(
  supabase: SupabaseClient,
  baseUrl: string,
  forcar = false,
): Promise<{ ok: boolean; enviado: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('solicitar_verificacao_email', {
      p_base_url: baseUrl,
      p_forcar: forcar,
    })
    if (error) return { ok: false, enviado: false, error: error.message }
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.enviar) return { ok: true, enviado: false } // já verificado ou token pendente
    const r = await enviarEmail({
      to: row.destinatario as string,
      subject: 'Confirme sua conta — Plataforma UBM',
      html: htmlVerificacao((row.nome as string) ?? '', row.link as string),
    })
    return { ok: r.ok, enviado: r.ok, error: r.error }
  } catch (e) {
    return { ok: false, enviado: false, error: e instanceof Error ? e.message : String(e) }
  }
}
