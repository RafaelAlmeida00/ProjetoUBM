/**
 * T4.1 — FakeSignatureGateway: adapter determinístico para CI/testes (sem rede/cota).
 * - criarPedido: retorna provedor_doc_id estável + clausulaAceiteMeioEletronico=true (CA4/CA9).
 * - cancelarPedido: idempotente (não lança se não existe — já cancelado).
 * - baixarProvaAssinada: retorna PDF mínimo + manifesto fake.
 */
import type { SignatureGateway, CriarPedidoParams, CriarPedidoResult, BaixarProvaResult } from '../gateway'

/** PDF mínimo válido (header %PDF-1.4 + EOF) para testes. */
const FAKE_PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, // %PDF-1.4
  0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,         // comment
  0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a,               // %%EOF
])

export class FakeSignatureGateway implements SignatureGateway {
  /** Discriminante para testes: identifica que é o adapter fake. */
  readonly _isFake = true as const

  private readonly _pedidos = new Map<string, { params: CriarPedidoParams; cancelado: boolean }>()
  private _counter = 0

  async criarPedido(params: CriarPedidoParams): Promise<CriarPedidoResult> {
    this._counter++
    const provedorDocId = `fake-doc-${params.documentoId}-${this._counter}`
    this._pedidos.set(provedorDocId, { params, cancelado: false })

    return {
      provedor_doc_id: provedorDocId,
      link_assinatura: `https://fake.assinatura/${provedorDocId}`,
      clausulaAceiteMeioEletronico: params.clausulaAceiteMeioEletronico ?? true,
      // CA9: único signatário = o representante passado (nunca admin)
      signatarios: [
        { nome: params.signatario.nome, email: params.signatario.email },
      ],
    }
  }

  async cancelarPedido(provedorDocId: string): Promise<void> {
    // Idempotente: marca como cancelado se existir; silencioso se não existir
    const pedido = this._pedidos.get(provedorDocId)
    if (pedido) {
      pedido.cancelado = true
    }
    // Não lança se inexistente (idempotência — CA12)
  }

  async baixarProvaAssinada(provedorDocId: string): Promise<BaixarProvaResult> {
    return {
      pdfBuffer: FAKE_PDF_BYTES.buffer.slice(0) as ArrayBuffer,
      manifesto: {
        hash_sha256: `fake-hash-${provedorDocId}`,
        assinado_em: new Date().toISOString(),
        provedor: 'fake',
        doc_id: provedorDocId,
      },
    }
  }
}
