import { createSupabaseServerClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Tipos públicos exportados
// ---------------------------------------------------------------------------

/** Evento da linha do tempo de uma dor (retornado por ler_timeline_dor). */
export interface EventoTimelineDor {
  tipo: string
  ocorreu_em: string
  ator_papel: string
  rotulo: string
}

/** Anexo de dor com signed URL para download (bucket privado — createSignedUrl). */
export interface AnexoPublico {
  id: string
  nome_original: string
  mime_type: string
  tamanho_bytes: number
  storage_path: string
  /** URL assinada (TTL 3600s). Nunca usa getPublicUrl — bucket dor-anexos é privado. */
  signedUrl: string
}

/**
 * Dor para a vitrine pública (/dores) — lista resumida.
 * Nunca expõe autor_id, rep_nome, departamento, cargo (PII — RS-D2).
 * projeto_status: status do projeto ativo para esta dor (ADR-0002 — selo de estágio).
 *   undefined = dor publicada sem projeto ainda ("Publicada")
 *   "finalizado" = projeto encerrado ("Finalizado")
 *   qualquer outro valor = projeto ativo ("Virou caso")
 */
export interface DorVitrine {
  id: string
  descricao: string
  empresa_nome: string
  cursos: string[]
  publicada_em: string | null
  /** Status do projeto associado via uq_projeto_dor. undefined = sem projeto ainda. */
  projeto_status?: string
}

/**
 * Dor completa para a página pública de detalhe (/dores/[id]).
 * Inclui anexos com signed URLs prontas para download.
 */
export interface DorPublica extends DorVitrine {
  anexos: AnexoPublico[]
}

// ---------------------------------------------------------------------------
// listarDoresVitrine — RSC público (/dores)
// ---------------------------------------------------------------------------

/**
 * Lista dores publicadas para a vitrine pública (RN17/CA17).
 * Usa o client de servidor com anon key — RLS dor_select_publica aplica.
 * Nunca retorna dados PII (autor_id, rep_nome, etc.).
 */
export async function listarDoresVitrine(): Promise<DorVitrine[]> {
  try {
    const supabase = await createSupabaseServerClient()

    // Busca dores publicadas com empresa, cursos e projeto ativo (ADR-0002 — selo de estágio)
    // projeto(status) via FK dor_id — uq_projeto_dor garante 0 ou 1 linha por dor
    const { data, error } = await supabase
      .from('dor')
      .select(
        'id, descricao, publicada_em, empresa_id, empresa:empresa(nome_canonico), dor_curso(curso), projeto(status)',
      )
      .eq('status_dor', 'publicada')
      .is('deleted_at', null)
      .order('publicada_em', { ascending: false })
      .limit(50)

    if (error || !data) return []

    return data.map((row) => {
      const emp = Array.isArray(row.empresa) ? row.empresa[0] : row.empresa
      const cursos = (row.dor_curso ?? []).map((dc: { curso: string }) => dc.curso)

      // projeto pode ser [] (sem projeto) ou [{ status }] (com projeto ativo)
      const projetoArr = Array.isArray(row.projeto) ? row.projeto : (row.projeto ? [row.projeto] : [])
      // Filtra só projetos ativos (deleted_at não é retornado aqui — o join já filtra via RLS pública)
      const projetoAtivo = projetoArr.find((p: { status: string }) => p?.status)
      const projeto_status = projetoAtivo?.status as string | undefined

      return {
        id: row.id as string,
        descricao: row.descricao as string,
        empresa_nome: (emp?.nome_canonico as string | undefined) ?? '—',
        cursos,
        publicada_em: (row.publicada_em as string | null) ?? null,
        projeto_status,
      }
    })
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// obterDorPublica — RSC público (/dores/[id])
// ---------------------------------------------------------------------------

/**
 * Obtém uma dor publicada com empresa, cursos e anexos (signed URLs).
 * Retorna null se a dor não existir ou não for publicada (RLS barra automaticamente).
 * Signed URLs: createSignedUrl server-side com anon key (policy storage_dor_select_publica).
 * NUNCA usa getPublicUrl — bucket dor-anexos é privado (public=false).
 */
export async function obterDorPublica(id: string): Promise<DorPublica | null> {
  try {
    const supabase = await createSupabaseServerClient()

    // Busca dor — RLS dor_select_publica garante que só publicadas chegam
    const { data, error } = await supabase
      .from('dor')
      .select(
        'id, descricao, publicada_em, empresa:empresa(nome_canonico), dor_curso(curso)',
      )
      .eq('id', id)
      .eq('status_dor', 'publicada')
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !data) return null

    const emp = Array.isArray(data.empresa) ? data.empresa[0] : data.empresa
    const cursos = (data.dor_curso ?? []).map((dc: { curso: string }) => dc.curso)

    // Busca anexos — RLS anexo_select_publica garante só os de dores publicadas
    const { data: anexosData, error: anexosError } = await supabase
      .from('anexo_dor')
      .select('id, nome_original, mime_type, tamanho_bytes, storage_path')
      .eq('dor_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (anexosError || !anexosData) {
      // Dor existe mas anexos falharam — retorna dor sem anexos
      return {
        id: data.id as string,
        descricao: data.descricao as string,
        empresa_nome: (emp?.nome_canonico as string | undefined) ?? '—',
        cursos,
        publicada_em: (data.publicada_em as string | null) ?? null,
        anexos: [],
      }
    }

    // Gera signed URLs para cada anexo (bucket privado — createSignedUrl, TTL 3600s)
    const anexos: AnexoPublico[] = await Promise.all(
      anexosData.map(async (a) => {
        const { data: signed, error: signErr } = await supabase.storage
          .from('dor-anexos')
          .createSignedUrl(a.storage_path as string, 3600)

        return {
          id: a.id as string,
          nome_original: a.nome_original as string,
          mime_type: a.mime_type as string,
          tamanho_bytes: a.tamanho_bytes as number,
          storage_path: a.storage_path as string,
          signedUrl: signErr || !signed ? '' : signed.signedUrl,
        }
      }),
    )

    return {
      id: data.id as string,
      descricao: data.descricao as string,
      empresa_nome: (emp?.nome_canonico as string | undefined) ?? '—',
      cursos,
      publicada_em: (data.publicada_em as string | null) ?? null,
      anexos,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// obterProjetoDaDor — lookup reverso dor_id → projeto (ADR-0002)
// ---------------------------------------------------------------------------

/**
 * Lookup reverso: dado um dor_id, retorna o projeto ativo (deleted_at is null)
 * que referencia essa dor via uq_projeto_dor (relação 1:1).
 * Retorna null se não houver projeto (dor sem caso ainda) ou em erro.
 * Usado por /dores/[id] para decidir se exibe a seção "A jornada deste caso".
 * NUNCA faz select de perfil — PII de equipe fica nas RPCs SECURITY DEFINER.
 */
export interface ProjetoDaDor {
  projeto_id: string
  status: string
}

export async function obterProjetoDaDor(dorId: string): Promise<ProjetoDaDor | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('projeto')
      .select('id, status')
      .eq('dor_id', dorId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !data) return null

    return {
      projeto_id: data.id as string,
      status: data.status as string,
    }
  } catch {
    return null
  }
}

/**
 * 009 — Lookup reverso projeto→dor (forward). Usado pelo redirect
 * /app/projetos/[id]→/app/dores/[dor_id] e pelo remapeamento de deep-links de notificação.
 * SEM ORÁCULO de existência: projeto inexistente, soft-deletado ou sem-acesso (RLS) caem todos
 * no mesmo caminho → null uniforme. NUNCA faz select de perfil/PII (RS9).
 */
export async function obterDorDoProjeto(projetoId: string): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('projeto')
      .select('dor_id')
      .eq('id', projetoId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error || !data) return null
    return (data.dor_id as string) ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// obterTimelineDor — RSC /app/dores/[id] (Delta-edição)
// ---------------------------------------------------------------------------

/**
 * Retorna a linha do tempo append-only de uma dor via RPC ler_timeline_dor.
 * Visibilidade controlada por RLS no banco (publicada→todos; não-publicada→autor+admin).
 * Retorna [] em caso de erro para não quebrar a página.
 */
export async function obterTimelineDor(dorId: string): Promise<EventoTimelineDor[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('ler_timeline_dor', { p_dor_id: dorId })
    if (error || !data) return []
    return (data as EventoTimelineDor[])
  } catch {
    return []
  }
}
