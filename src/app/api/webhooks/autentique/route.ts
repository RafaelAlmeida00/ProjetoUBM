/**
 * T4.5 — Route Handler POST /api/webhooks/autentique (server-only, service_role).
 * Formato real do Autentique (doc oficial):
 *   - Header `X-Autentique-Signature` = HMAC-SHA256(secret, rawBody) em hex (RS7/CA8).
 *   - Body: { event: { type, data: { document } } } — type em 'signature.accepted' |
 *     'document.finished' | 'signature.rejected'; data.document = id do documento.
 * RS8: idempotência por provedor_doc_id (confirmar_assinatura é no-op se já assinada).
 * RS9: baixa prova → upload ANTES de chamar a RPC (prova antes do status).
 * RS10: service_role SOMENTE aqui (único ponto privilegiado — ADR-0001/V1).
 * RS17: logs sem segredo/PII em claro.
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getSignatureGateway } from '@/lib/signature/gateway'

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
interface AutentiqueEvent {
  event?: { type?: string; data?: { document?: string } }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // RS7: segredo obrigatório
  const secret = process.env['AUTENTIQUE_WEBHOOK_SECRET']
  if (!secret) {
    console.error('[webhook/autentique] AUTENTIQUE_WEBHOOK_SECRET não configurado')
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Corpo CRU é necessário para validar o HMAC (assinatura é sobre os bytes exatos).
  const raw = await req.text()
  const headerSig = (req.headers.get('x-autentique-signature') ?? '').replace(/^sha256=/i, '').trim().toLowerCase()
  const expectedSig = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex').toLowerCase()
  if (!headerSig || !timingSafeEqualHex(headerSig, expectedSig)) {
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
  const provedorDocId = body.event?.data?.document
  if (!tipo || typeof provedorDocId !== 'string') {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  // RS10: service_role SOMENTE aqui
  const adminClient = createSupabaseAdminClient()
  const gateway = getSignatureGateway()

  try {
    // ── Documento assinado / concluído → sela a proposta (idempotente RS8/CA7) ──
    if (tipo === 'signature.accepted' || tipo === 'document.finished') {
      // RS9: baixa a prova ANTES de chamar a RPC (prova antes do status — RN11/CA6)
      const { pdfBuffer, manifesto } = await gateway.baixarProvaAssinada(provedorDocId)

      const storagePath = `webhooks/autentique/${provedorDocId}-assinado.pdf`
      const { error: uploadErr } = await adminClient.storage
        .from('propostas')
        .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

      if (uploadErr) {
        console.error('[webhook/autentique] Falha ao salvar prova no Storage — status não vira aprovado')
        return NextResponse.json({ error: 'Erro ao armazenar prova' }, { status: 500 })
      }

      const { error: rpcErr } = await adminClient.rpc('confirmar_assinatura', {
        p_origem: 'autentique',
        p_chave: provedorDocId,
        p_storage_path: storagePath,
        p_evidencias: { ...manifesto, provedor: 'autentique', webhook_event: tipo },
      })

      if (rpcErr) {
        console.error('[webhook/autentique] Erro na RPC confirmar_assinatura')
        return NextResponse.json({ error: 'Erro ao confirmar assinatura' }, { status: 500 })
      }

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // ── Assinatura recusada → marca status, NÃO avança o projeto (CA10) ──────────
    if (tipo === 'signature.rejected') {
      try {
        await adminClient.rpc('registrar_recusa_assinatura', {
          p_provedor_doc_id: provedorDocId,
          p_motivo: 'recusado_pelo_signatario',
        })
      } catch {
        console.warn('[webhook/autentique] registrar_recusa_assinatura não disponível')
      }
      return NextResponse.json({ ok: true, status: 'recusado' }, { status: 200 })
    }

    // Evento não tratado → 200 (acknowledge sem re-enfileirar)
    return NextResponse.json({ ok: true, status: 'evento_ignorado' }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    console.error('[webhook/autentique] Erro inesperado:', msg.slice(0, 120))
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
