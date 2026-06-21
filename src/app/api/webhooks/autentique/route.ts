/**
 * T4.5 — Route Handler POST /api/webhooks/autentique (server-only, service_role).
 * RS7: valida AUTENTIQUE_WEBHOOK_SECRET constant-time → 401 sem efeito se inválido (CA8).
 * RS8: idempotência por provedor_doc_id.
 * RS9: baixa prova → upload ANTES de chamar RPC (prova antes do status).
 * RS10: service_role SOMENTE aqui (único ponto privilegiado — ADR-0001/V1).
 * RS17: logs sem segredo/PII em claro.
 * CA10: recusa/expiração → marca status, não avança projeto.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getSignatureGateway } from '@/lib/signature/gateway'

// Força execução apenas no Node.js (server-only — RS10)
export const runtime = 'nodejs'

// ── Comparação constant-time (anti-timing — RS7) ────────────────────────────

function constantTimeEqual(a: string, b: string): boolean {
  // Usa Buffer.from para garantir comparação constant-time mesmo com strings de comprimentos diferentes
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  // Compara sempre o comprimento do segredo esperado para não vazar tamanho
  if (bufA.length !== bufB.length) {
    // Realiza a comparação de qualquer forma (mesmo resultado final: false) para não vazar timing
    let diff = bufA.length ^ bufB.length
    for (let i = 0; i < Math.min(bufA.length, bufB.length); i++) {
      diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0)
    }
    return diff === 0
  }
  let diff = 0
  for (let i = 0; i < bufA.length; i++) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0)
  }
  return diff === 0
}

// ── Tipos de payload do Autentique ──────────────────────────────────────────

interface AutentiqueWebhookPayload {
  event: string
  document: {
    id: string
    status?: string
  }
}

function isValidPayload(body: unknown): body is AutentiqueWebhookPayload {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b['event'] === 'string' &&
    !!b['document'] &&
    typeof (b['document'] as Record<string, unknown>)['id'] === 'string'
  )
}

// ── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // RS7: ler e validar o segredo ANTES de qualquer operação
  const expectedSecret = process.env['AUTENTIQUE_WEBHOOK_SECRET']
  if (!expectedSecret) {
    // Segredo não configurado → rejeita silenciosamente (sem vazar detalhes)
    console.error('[webhook/autentique] AUTENTIQUE_WEBHOOK_SECRET não configurado')
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const receivedSecret = req.headers.get('x-autentique-signature') ?? ''
  if (!constantTimeEqual(receivedSecret, expectedSecret)) {
    // RS7/CA8: segredo inválido → 401, NADA muda
    console.warn('[webhook/autentique] Segredo inválido recebido — rejeitando sem efeito')
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Segredo válido — agora processa
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!isValidPayload(body)) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { event, document: doc } = body
  const provedorDocId = doc.id

  // RS10: service_role SOMENTE aqui
  const adminClient = createSupabaseAdminClient()
  const gateway = getSignatureGateway()

  try {
    // ── Evento: documento assinado ────────────────────────────────────────────
    if (event === 'document.signed') {
      // RS9: baixa prova ANTES de chamar a RPC (prova antes do status — RN11/CA6)
      const { pdfBuffer, manifesto } = await gateway.baixarProvaAssinada(provedorDocId)

      // Upload ao bucket 'propostas' via service_role (único caminho privilegiado)
      const storagePath = `webhooks/autentique/${provedorDocId}-assinado.pdf`
      const { error: uploadErr } = await adminClient.storage
        .from('propostas')
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true, // idempotência: reentrega sobrescreve o mesmo arquivo
        })

      if (uploadErr) {
        // Prova não pode ser persistida → NÃO avança o status (RS9/RN11)
        console.error('[webhook/autentique] Falha ao salvar prova no Storage — status não vira aprovado')
        return NextResponse.json({ error: 'Erro ao armazenar prova' }, { status: 500 })
      }

      // RPC confirmar_assinatura — idempotente por (origem, provedor_doc_id) (RS8/CA7)
      const { error: rpcErr } = await adminClient.rpc('confirmar_assinatura', {
        p_origem: 'autentique',
        p_chave: provedorDocId,
        p_storage_path: storagePath,
        p_evidencias: {
          ...manifesto,
          provedor: 'autentique',
          webhook_event: event,
        },
      })

      if (rpcErr) {
        // Logar sem PII (RS17) — sem expor o erro interno na resposta
        console.error('[webhook/autentique] Erro na RPC confirmar_assinatura — doc_id omitido nos logs')
        return NextResponse.json({ error: 'Erro ao confirmar assinatura' }, { status: 500 })
      }

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // ── Evento: documento recusado ────────────────────────────────────────────
    if (event === 'document.refused') {
      // CA10: marca status recusado via RPC — NÃO avança o projeto
      try {
        await adminClient.rpc('registrar_recusa_assinatura', {
          p_provedor_doc_id: provedorDocId,
          p_motivo: 'recusado_pelo_signatario',
        })
      } catch {
        // RPC pode não existir ainda (Onda 3) — falha silenciosa, notificação é do banco
        console.warn('[webhook/autentique] registrar_recusa_assinatura não disponível')
      }
      return NextResponse.json({ ok: true, status: 'recusado' }, { status: 200 })
    }

    // ── Evento: documento expirado ────────────────────────────────────────────
    if (event === 'document.expired') {
      // CA10: marca status expirado — NÃO avança o projeto
      try {
        await adminClient.rpc('registrar_recusa_assinatura', {
          p_provedor_doc_id: provedorDocId,
          p_motivo: 'expirado_pelo_provedor',
        })
      } catch {
        console.warn('[webhook/autentique] registrar_recusa_assinatura não disponível')
      }
      return NextResponse.json({ ok: true, status: 'expirado' }, { status: 200 })
    }

    // Evento desconhecido → 200 para não re-enfileirar (acknowledge sem processar)
    return NextResponse.json({ ok: true, status: 'evento_ignorado' }, { status: 200 })
  } catch (err) {
    // RS17: não expor internals / segredos na resposta
    const msg = err instanceof Error ? err.message : 'Erro interno'
    console.error('[webhook/autentique] Erro inesperado:', msg.slice(0, 120))
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
