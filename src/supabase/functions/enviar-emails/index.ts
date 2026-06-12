// Edge Function — enviar-emails
// Drena a fila fila.email_outbox via RPCs (service_role) e envia por Resend.
//
// Envs injetadas automaticamente pela plataforma Supabase:
//   SUPABASE_URL              — URL do projeto
//   SUPABASE_SERVICE_ROLE_KEY — chave service_role (nunca exposta ao cliente)
//
// Envs a setar manualmente (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   — obrigatória; chave da conta Resend (https://resend.com)
//   RESEND_FROM      — opcional; default "Plataforma UBM <onboarding@resend.dev>"
//   DRAIN_SECRET     — opcional; se setada, invocações devem enviar header x-drain-secret igual

import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface EmailOutboxRow {
  id: string;
  chave_idempotencia: string;
  destinatario_email: string;
  template: string;
  dados: Record<string, string>;
  tentativas: number;
}

interface RenderedEmail {
  subject: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Renderização de templates
// ---------------------------------------------------------------------------

/** Escapa texto p/ interpolar com segurança no HTML do e-mail (anti-injeção). */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

/** Só permite URLs https:// (bloqueia javascript:/data: caso algum cliente renderize). */
function safeUrl(u: string): string {
  return /^https:\/\//i.test(u.trim()) ? u.trim() : "#";
}

function renderTemplate(template: string, dados: Record<string, string>): RenderedEmail {
  if (template === "verificacao_conta") {
    const nome = escapeHtml(dados.nome ?? "");
    const link = escapeHtml(safeUrl(dados.link ?? "#"));
    return {
      subject: "Confirme sua conta — Plataforma UBM",
      html: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirme sua conta — Plataforma UBM</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;
                      box-shadow:0 4px 24px rgba(28,94,145,0.10);
                      overflow:hidden;max-width:600px;width:100%;">
          <!-- Cabeçalho -->
          <tr>
            <td style="background:#1C5E91;padding:32px 40px;text-align:center;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                Plataforma UBM
              </span>
            </td>
          </tr>
          <!-- Corpo -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1e293b;line-height:1.6;">
                Olá${nome ? ", <strong>" + nome + "</strong>" : ""}!
              </p>
              <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6;">
                Clique no botão abaixo para confirmar o seu endereço de e-mail e
                ativar o acesso à Plataforma UBM.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="border-radius:8px;background:#1C5E91;">
                    <a href="${link}"
                       style="display:inline-block;padding:14px 32px;
                              color:#ffffff;font-size:15px;font-weight:600;
                              text-decoration:none;letter-spacing:0.2px;">
                      Confirmar e-mail
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;line-height:1.5;">
                Se o botão não funcionar, copie e cole o link abaixo no navegador:
              </p>
              <p style="margin:0 0 24px;font-size:12px;color:#64748b;word-break:break-all;">
                <a href="${link}" style="color:#1C5E91;">${link}</a>
              </p>
              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
                Este link expira em <strong>60 minutos</strong>. Se você não criou
                uma conta na Plataforma UBM, ignore este e-mail.
              </p>
            </td>
          </tr>
          <!-- Rodapé -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;
                       border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Plataforma UBM — Conectando universidade, empresa e mercado.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    };
  }

  // Fallback genérico para templates desconhecidos (JSON escapado — anti-injeção)
  return {
    subject: `Notificação — Plataforma UBM [${escapeHtml(template)}]`,
    html: `<p>Você recebeu uma notificação da Plataforma UBM.</p>
<pre style="font-size:12px;color:#666">${escapeHtml(JSON.stringify(dados, null, 2))}</pre>`,
  };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Autorização por segredo compartilhado (permite invocação por pg_cron sem JWT)
  const drainSecret = Deno.env.get("DRAIN_SECRET");
  if (drainSecret) {
    const provided = req.headers.get("x-drain-secret");
    if (provided !== drainSecret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Validação obrigatória das envs
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!resendApiKey) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY não configurada — configure o segredo na edge function" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const resendFrom = Deno.env.get("RESEND_FROM") ?? "Plataforma UBM <onboarding@resend.dev>";

  // Cliente Supabase com service_role (acesso às RPCs restritas)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Drena até 20 registros pendentes (claim atômico via RPC)
  const { data: lote, error: erroRpc } = await supabase
    .rpc("drenar_emails_pendentes", { p_limite: 20 });

  if (erroRpc) {
    return new Response(
      JSON.stringify({ error: "falha ao drenar fila", detail: erroRpc.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const rows: EmailOutboxRow[] = lote ?? [];
  let enviados = 0;
  let falhas = 0;

  // Processa cada item do lote
  for (const row of rows) {
    const { subject, html } = renderTemplate(row.template, row.dados ?? {});

    let erroEnvio: string | null = null;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: row.destinatario_email,
          subject,
          html,
        }),
      });

      if (res.ok) {
        // Marca como enviado
        await supabase.rpc("marcar_email_resultado", {
          p_id: row.id,
          p_ok: true,
          p_erro: null,
        });
        enviados++;
        continue;
      }

      // Erro HTTP da Resend
      const corpo = await res.text().catch(() => "(corpo ilegível)");
      erroEnvio = `HTTP ${res.status}: ${corpo.slice(0, 300)}`;
    } catch (e) {
      erroEnvio = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
    }

    // Marca como falha (backoff + tentativas, lógica no RPC)
    await supabase.rpc("marcar_email_resultado", {
      p_id: row.id,
      p_ok: false,
      p_erro: erroEnvio,
    });
    falhas++;
  }

  return new Response(
    JSON.stringify({ drenados: rows.length, enviados, falhas }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
