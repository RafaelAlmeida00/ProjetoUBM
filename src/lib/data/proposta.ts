import { createSupabaseServerClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Tipos exportados — T5.4
// ---------------------------------------------------------------------------

/** Estado da proposta visto pelo papel autorizado. */
export type EstadoProposta =
  | 'aguardando_proposta'
  | 'proposta_em_analise'
  | 'proposta_aprovada'
  | 'em_execucao'
  | 'finalizado'

export type OrigemAssinatura = 'autentique' | 'upload_livre'

export type StatusAssinatura =
  | 'pendente'
  | 'enviada'
  | 'assinada'
  | 'recusada'
  | 'expirada'
  | 'cancelada'

/**
 * Dados de proposta passados ao `SecaoProposta`.
 * O RSC faz o gating: só inclui campos que o papel pode ver (RN18).
 */
export interface DadosProposta {
  /** Estado do projeto (máquina de estados da 005/006). */
  estadoProjeto: EstadoProposta
  /** ID do documento (se existir). Necessário para contrapropor/enviar assinado. */
  documentoId?: string | null
  /** URL assinada (TTL 3600) para download do PDF original. Só para papéis autorizados. */
  documentoSignedUrl?: string | null
  /** URL assinada para download do PDF assinado (prova). Só para papéis autorizados. */
  provaSignedUrl?: string | null
  /** Origem da assinatura (para label do badge de prova). */
  origemAssinatura?: OrigemAssinatura | null
  /** Status da assinatura pendente. */
  statusAssinatura?: StatusAssinatura | null
  /** ID do pedido no provedor Autentique (para cancelar ao contrapropor). Caminho A. */
  provedorDocId?: string | null
  /** Link de assinatura no Autentique (para o representante clicar). Caminho A. */
  linkAssinatura?: string | null
  /** Contraproposta mais recente (motivo). Só para papéis autorizados. */
  contraproposta?: { motivo: string; criadoEm: string } | null
  /** Número de rodadas de contraproposta (para alerta de loop RN16b). */
  nRodadas?: number
}

// ---------------------------------------------------------------------------
// lerDadosProposta — RSC reader com gating por papel (RN18)
// ---------------------------------------------------------------------------

/**
 * Lê estado/assinatura/contraproposta da proposta de um projeto, gateando os dados
 * conforme o papel informado. Usa createSignedUrl (TTL 3600) para documentos privados.
 *
 * @param projetoId  ID do projeto
 * @param papel      'host' | 'coordenador' | 'representante' | 'admin' | 'aluno' | null
 */
export async function lerDadosProposta(
  projetoId: string,
  papel: 'host' | 'coordenador' | 'representante' | 'admin' | 'aluno' | null,
): Promise<DadosProposta | null> {
  try {
    const supabase = await createSupabaseServerClient()

    // 1. Estado do projeto
    const { data: proj, error: projErr } = await supabase
      .from('projeto')
      .select('status')
      .eq('id', projetoId)
      .is('deleted_at', null)
      .single()

    if (projErr || !proj) return null

    const estadoProjeto = proj.status as EstadoProposta

    // Papéis sem visibilidade: retorna apenas o estado (sem documento)
    if (!papel || papel === 'aluno') {
      return { estadoProjeto }
    }

    // 2. Contraproposta mais recente + contagem de rodadas — buscadas ANTES do doc.
    //    Após uma contraproposta o doc vigente fica `superado_em` (some do fetch abaixo),
    //    e o estado volta a `aguardando_proposta`; o host precisa ver o MOTIVO mesmo sem
    //    doc vigente. Antes, o return cedo (sem doc) escondia a contraproposta.
    const { data: contras } = await supabase
      .from('contraproposta')
      .select('motivo, created_at')
      .eq('projeto_id', projetoId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)

    const { data: contaContras } = await supabase
      .from('contraproposta')
      .select('id', { count: 'exact', head: true })
      .eq('projeto_id', projetoId)
      .is('deleted_at', null)

    const nRodadas = (contaContras as unknown as { count: number } | null)?.count ?? 0
    const contraproposta =
      contras && contras.length > 0
        ? { motivo: contras[0].motivo, criadoEm: contras[0].created_at }
        : null

    // 3. Documento proposta vigente (não-aluno/não-null)
    const { data: doc } = await supabase
      .from('documento_proposta')
      .select('id, storage_path_original, storage_path_assinado, superado_em')
      .eq('projeto_id', projetoId)
      .is('deleted_at', null)
      .is('superado_em', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!doc) {
      // Sem doc vigente (ex.: pós-contraproposta) — ainda assim devolve a contraproposta.
      return { estadoProjeto, contraproposta, nRodadas }
    }

    // 4. Assinatura associada ao documento
    const { data: assin } = await supabase
      .from('assinatura')
      .select('status, origem, provedor_doc_id, link_assinatura')
      .eq('documento_id', doc.id)
      .maybeSingle()

    // 5. Signed URLs (bucket privado 'propostas', TTL 3600)
    let documentoSignedUrl: string | null = null
    let provaSignedUrl: string | null = null

    if (doc.storage_path_original) {
      const { data: signed } = await supabase.storage
        .from('propostas')
        .createSignedUrl(doc.storage_path_original, 3600)
      documentoSignedUrl = signed?.signedUrl ?? null
    }

    if (doc.storage_path_assinado) {
      const { data: signedProva } = await supabase.storage
        .from('propostas')
        .createSignedUrl(doc.storage_path_assinado, 3600)
      provaSignedUrl = signedProva?.signedUrl ?? null
    }

    // 6. Link de assinatura só para representante no Caminho A
    const linkAssinatura =
      papel === 'representante' && assin?.origem === 'autentique'
        ? (assin.link_assinatura ?? null)
        : null

    return {
      estadoProjeto,
      documentoId: doc.id,
      documentoSignedUrl,
      provaSignedUrl,
      origemAssinatura: (assin?.origem as OrigemAssinatura) ?? null,
      statusAssinatura: (assin?.status as StatusAssinatura) ?? null,
      provedorDocId: assin?.provedor_doc_id ?? null,
      linkAssinatura,
      contraproposta,
      nRodadas,
    }
  } catch {
    return null
  }
}
