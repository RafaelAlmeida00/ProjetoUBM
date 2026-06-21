/**
 * T4.1 — Porta de domínio SignatureGateway (provider-agnostic).
 * arch §5: abstrai "como a prova assinada é obtida"; a virada de status é sempre da RPC.
 * Factory por env: com AUTENTIQUE_API_TOKEN → AutentiqueGateway; sem → FakeSignatureGateway.
 */

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface CriarPedidoParams {
  projetoId: string
  documentoId: string
  storagePath: string
  signatario: { nome: string; email: string }
  /** Inclui cláusula de aceite do meio eletrônico (RN6/CA4) — default true */
  clausulaAceiteMeioEletronico?: boolean
}

export interface CriarPedidoResult {
  provedor_doc_id: string
  clausulaAceiteMeioEletronico: boolean
  signatarios: { nome: string; email: string }[]
}

export interface BaixarProvaResult {
  pdfBuffer: ArrayBuffer
  manifesto: Record<string, unknown>
}

export interface SignatureGateway {
  /**
   * Cria o pedido de assinatura no provedor externo.
   * Signatário único = o representante (CA9 — nunca admin).
   * Sempre inclui a cláusula de aceite do meio eletrônico (CA4).
   */
  criarPedido(params: CriarPedidoParams): Promise<CriarPedidoResult>

  /**
   * Cancela o pedido no provedor (anti versão obsoleta — RN16/RS15).
   * Idempotente: não lança se o pedido não existir ou já estiver cancelado.
   */
  cancelarPedido(provedorDocId: string): Promise<void>

  /**
   * Baixa o PDF assinado + manifesto de auditoria do provedor.
   * Chamado pelo webhook ANTES de chamar a RPC (prova antes do status — RN11/RS9).
   */
  baixarProvaAssinada(provedorDocId: string): Promise<BaixarProvaResult>
}

// ── Imports estáticos dos adapters (ESM — Vite não resolve require() de paths relativos) ──
import { FakeSignatureGateway } from './adapters/fake'
import { AutentiqueGateway } from './adapters/autentique'

// ── Factory por env ───────────────────────────────────────────────────────────

/**
 * Retorna o gateway apropriado conforme o ambiente:
 * - Com AUTENTIQUE_API_TOKEN → AutentiqueGateway
 * - Sem token (CI/sandbox/teste) → FakeSignatureGateway
 */
export function getSignatureGateway(): SignatureGateway {
  const token = process.env['AUTENTIQUE_API_TOKEN']
  if (token) {
    return new AutentiqueGateway(token)
  }
  return new FakeSignatureGateway()
}
