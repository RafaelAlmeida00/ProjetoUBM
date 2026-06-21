/**
 * T4.1 — AutentiqueGateway: adapter GraphQL mínimo para o Autentique (Caminho A).
 * - criarPedido: cria documento + signatário via GraphQL (único signatário = representante — CA9).
 * - cancelarPedido: deleta o documento no Autentique (anti versão obsoleta — RN16/RS15).
 * - baixarProvaAssinada: baixa PDF assinado + manifesto de auditoria.
 * Degrada com mensagem honesta no rate limit / indisponibilidade (arch §6).
 * NEVER importado no cliente — server-only (RS10/V1).
 */
import type { SignatureGateway, CriarPedidoParams, CriarPedidoResult, BaixarProvaResult } from '../gateway'

const AUTENTIQUE_GQL_URL = 'https://api.autentique.com.br/2/graphql'

interface GqlResponse<T> {
  data?: T
  errors?: { message: string }[]
}

export class AutentiqueGateway implements SignatureGateway {
  readonly _isFake = false as const

  constructor(private readonly token: string) {}

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }
  }

  private async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    let res: Response
    try {
      res = await fetch(AUTENTIQUE_GQL_URL, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ query, variables }),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Autentique indisponível no momento. Tente o Caminho B (upload). Detalhe: ${msg}`)
    }

    if (res.status === 429) {
      throw new Error(
        'Limite de requisições Autentique atingido. Use o Caminho B (upload do PDF assinado) ou aguarde alguns minutos.',
      )
    }

    if (!res.ok) {
      throw new Error(`Autentique retornou erro ${res.status}. Use o Caminho B (upload) ou tente novamente.`)
    }

    const json = (await res.json()) as GqlResponse<T>
    if (json.errors?.length) {
      const msgs = json.errors.map((e) => e.message).join('; ')
      throw new Error(`Erro do Autentique: ${msgs}. Use o Caminho B (upload) se o problema persistir.`)
    }
    return json.data as T
  }

  async criarPedido(params: CriarPedidoParams): Promise<CriarPedidoResult> {
    // GraphQL mínimo: criar documento + um signatário (CA9 — único: o representante)
    const mutation = `
      mutation CriarDocumento($nome: String!, $signatarios: [SignatarioInput!]!, $mensagem: String) {
        createDocument(
          document: { name: $nome, message: $mensagem }
          signers: $signatarios
        ) {
          id
          signers { email }
        }
      }
    `
    const sandbox = process.env['AUTENTIQUE_SANDBOX'] === 'true'
    const mensagem = params.clausulaAceiteMeioEletronico !== false
      ? 'Ao assinar este documento, você declara aceitar o uso do meio eletrônico como forma válida de assinatura (MP 2.200-2/2001, Lei 14.063/2020).'
      : undefined

    type CreateResult = { createDocument: { id: string; signers: { email: string }[] } }
    const data = await this.gql<CreateResult>(mutation, {
      nome: `Proposta-${params.projetoId}-${params.documentoId}${sandbox ? '-SANDBOX' : ''}`,
      signatarios: [
        {
          email: params.signatario.email,
          name: params.signatario.nome,
          action: 'SIGN',
        },
      ],
      mensagem,
    })

    const docId = data.createDocument.id
    return {
      provedor_doc_id: docId,
      clausulaAceiteMeioEletronico: params.clausulaAceiteMeioEletronico ?? true,
      signatarios: [{ nome: params.signatario.nome, email: params.signatario.email }],
    }
  }

  async cancelarPedido(provedorDocId: string): Promise<void> {
    // Idempotente: se não existir / já cancelado, o Autentique retorna erro → silenciamos
    const mutation = `
      mutation CancelarDocumento($id: UUID!) {
        deleteDocument(id: $id)
      }
    `
    try {
      await this.gql<unknown>(mutation, { id: provedorDocId })
    } catch {
      // Idempotente: documento já cancelado/inexistente → sem efeito (RN16/RS15)
    }
  }

  async baixarProvaAssinada(provedorDocId: string): Promise<BaixarProvaResult> {
    // Busca o link de download do PDF assinado + manifesto via GraphQL
    const query = `
      query BuscarDocumento($id: UUID!) {
        document(id: $id) {
          id
          files { signed }
          signatures { name, email, ip, created_at, certificate { sha256 } }
        }
      }
    `
    type DocResult = {
      document: {
        id: string
        files: { signed: string | null }
        signatures: { name: string; email: string; ip: string; created_at: string; certificate: { sha256: string } | null }[]
      }
    }
    const data = await this.gql<DocResult>(query, { id: provedorDocId })
    const signedUrl = data.document.files.signed
    if (!signedUrl) {
      throw new Error('PDF assinado ainda não disponível no Autentique. Tente novamente em instantes.')
    }

    let pdfRes: Response
    try {
      pdfRes = await fetch(signedUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Falha ao baixar PDF assinado do Autentique: ${msg}`)
    }

    if (!pdfRes.ok) {
      throw new Error(`Falha ao baixar PDF assinado: status ${pdfRes.status}`)
    }

    const pdfBuffer = await pdfRes.arrayBuffer()
    const sig = data.document.signatures[0]
    const manifesto: Record<string, unknown> = {
      provedor: 'autentique',
      doc_id: provedorDocId,
      hash_sha256: sig?.certificate?.sha256 ?? null,
      assinado_em: sig?.created_at ?? new Date().toISOString(),
      ip_signatario: sig?.ip ?? null,
      email_signatario: sig?.email ?? null,
    }

    return { pdfBuffer, manifesto }
  }
}
