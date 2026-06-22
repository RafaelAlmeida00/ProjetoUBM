/**
 * T4.5 — Route Handler POST /api/webhooks/autentique (server-only, service_role).
 * Formato REAL do Autentique (validado ao vivo via API + doc oficial):
 *   - Header `X-Autentique-Signature` = HMAC-SHA256(secret, rawBody) em hex (RS7/CA8).
 *   - Body: { id, object, event: { id, type, data: { public_id, object, ... } } }.
 *     O identificador vem em `event.data.public_id` (NÃO `event.data.document`):
 *       · document.finished → data.public_id = id do DOCUMENTO (= provedor_doc_id) → SELA.
 *       · signature.accepted → data.public_id = public_id da ASSINATURA (não casa com o doc);
 *         o selo definitivo vem do document.finished. Best-effort: sela se vier data.document.
 * RS8: idempotência por provedor_doc_id (confirmar_assinatura é no-op se já assinada).
 * RS9: baixa prova → upload ANTES de chamar a RPC (prova antes do status).
 * RS10: service_role SOMENTE aqui (único ponto privilegiado — ADR-0001/V1).
 * RS17: logs sem segredo/PII em claro.
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getSignatureGateway, type SignatureGateway } from '@/lib/signature/gateway'
import type { SupabaseClient } from '@supabase/supabase-js'

// Força execução apenas no Node.js (server-only — RS10; precisa de node:crypto)
export const runtime = 'nodejs'

// ── HMAC-SHA256 do corpo cru + comparação constant-time (RS7) ────────────────
function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// ── Tipo do payload do Autentique ─────────────────────────────────────────────
interface AutentiqueEventData {
  public_id?: string
  document?: string
  object?: string
}
interface AutentiqueEvent {
  event?: { type?: string; data?: AutentiqueEventData }
}

/** Sela a proposta: baixa a prova (RS9) → upload → confirmar_assinatura (idempotente RS8). */
async function selarComoAssinado(
  adminClient: SupabaseClient,
  gateway: SignatureGateway,
  docId: string,
  tipo: string,
): Promise<NextResponse> {
  // RS9: baixa a prova ANTES de chamar a RPC (prova antes do status — RN11/CA6)
  const { pdfBuffer, manifesto } = await gateway.baixarProvaAssinada(docId)

  const storagePath = `webhooks/autentique/${docId}-assinado.pdf`
  const { error: uploadErr } = await adminClient.storage
    .from('propostas')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) {
    console.error('[webhook/autentique] Falha ao salvar prova no Storage — status não vira aprovado')
    return NextResponse.json({ error: 'Erro ao armazenar prova' }, { status: 500 })
  }

  const { error: rpcErr } = await adminClient.rpc('confirmar_assinatura', {
    p_origem: 'autentique',
    p_chave: docId,
    p_storage_path: storagePath,
    p_evidencias: { ...manifesto, provedor: 'autentique', webhook_event: tipo },
  })

  if (rpcErr) {
    console.error('[webhook/autentique] Erro na RPC confirmar_assinatura')
    return NextResponse.json({ error: 'Erro ao confirmar assinatura' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // RS7: o Autentique aceita 1 categoria de evento por webhook → há 2 webhooks (assinatura e
  // documento), cada um com SEU segredo. Aceitamos o HMAC que casar com QUALQUER um deles.
  const secrets = [
    process.env['AUTENTIQUE_WEBHOOK_SECRET_SIGN'],
    process.env['AUTENTIQUE_WEBHOOK_SECRET_DOC'],
    process.env['AUTENTIQUE_WEBHOOK_SECRET'], // compat: segredo único
  ].filter((s): s is string => !!s && s.length > 0)

  if (secrets.length === 0) {
    console.error('[webhook/autentique] nenhum AUTENTIQUE_WEBHOOK_SECRET* configurado')
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Corpo CRU é necessário para validar o HMAC (assinatura é sobre os bytes exatos).
  const raw = await req.text()
  const headerSig = (req.headers.get('x-autentique-signature') ?? '').replace(/^sha256=/i, '').trim().toLowerCase()
  const assinaturaOk =
    !!headerSig &&
    secrets.some((secret) =>
      timingSafeEqualHex(headerSig, crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex').toLowerCase()),
    )

  // DIAG temporário (remover após validar o formato ao vivo) — sem segredo/PII (RS17).
  // Revela: HMAC passou? qual event.type? quais chaves de event.data? Para travar o shape real.
  {
    let dt = '?'
    let dk = '-'
    try {
      const b = JSON.parse(raw) as AutentiqueEvent
      dt = b.event?.type ?? '?'
      dk = b.event?.data ? Object.keys(b.event.data).join(',') : '-'
    } catch {
      /* corpo não-JSON */
    }
    console.log(
      `[webhook/autentique][diag] hmacOk=${assinaturaOk} sig=${headerSig ? 'present' : 'absent'} type=${dt} dataKeys=${dk}`,
    )
  }

  if (!assinaturaOk) {
    // RS7/CA8: HMAC inválido → 401, NADA muda
    console.warn('[webhook/autentique] HMAC inválido — rejeitando sem efeito')
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: AutentiqueEvent
  try {
    body = JSON.parse(raw) as AutentiqueEvent
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const tipo = body.event?.type
  const data = body.event?.data
  if (!tipo) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const publicId = typeof data?.public_id === 'string' ? data.public_id : ''
  const documentId = typeof data?.document === 'string' ? data.document : ''

  // RS10: service_role SOMENTE aqui
  const adminClient = createSupabaseAdminClient()
  const gateway = getSignatureGateway()

  try {
    // ── Documento 100% assinado → sela a proposta (idempotente RS8/CA7) ──────────
    // event.data.public_id = id do documento (= provedor_doc_id). Fallback a data.document.
    if (tipo === 'document.finished') {
      const docId = publicId || documentId
      if (!docId) {
        console.warn('[webhook/autentique] document.finished sem id no payload — ack sem selar')
        return NextResponse.json({ ok: true, status: 'sem_id' }, { status: 200 })
      }
      return await selarComoAssinado(adminClient, gateway, docId, tipo)
    }

    // ── Assinatura aceita → o public_id aqui é da ASSINATURA, não do documento ────
    // Não casa com provedor_doc_id, então o selo definitivo vem do document.finished.
    // Best-effort: se o payload trouxer o id do documento (data.document), sela já.
    if (tipo === 'signature.accepted') {
      if (documentId) {
        return await selarComoAssinado(adminClient, gateway, documentId, tipo)
      }
      return NextResponse.json({ ok: true, status: 'aguardando_document_finished' }, { status: 200 })
    }

    // ── Assinatura recusada → marca status, NÃO avança o projeto (CA10) ──────────
    if (tipo === 'signature.rejected') {
      try {
        await adminClient.rpc('registrar_recusa_assinatura', {
          p_provedor_doc_id: publicId || documentId,
          p_motivo: 'recusado_pelo_signatario',
        })
      } catch {
        console.warn('[webhook/autentique] registrar_recusa_assinatura não disponível')
      }
      return NextResponse.json({ ok: true, status: 'recusado' }, { status: 200 })
    }

    // Evento não tratado (ex.: document.created, signature.viewed) → 200 (acknowledge)
    return NextResponse.json({ ok: true, status: 'evento_ignorado' }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    console.error('[webhook/autentique] Erro inesperado:', msg.slice(0, 120))
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
