import { createSupabaseServerClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Tipos públicos exportados
// ---------------------------------------------------------------------------

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
 */
export interface DorVitrine {
  id: string
  descricao: string
  empresa_nome: string
  cursos: string[]
  publicada_em: string | null
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

    // Busca dores publicadas com empresa e cursos em paralelo
    const { data, error } = await supabase
      .from('dor')
      .select(
        'id, descricao, publicada_em, empresa_id, empresa:empresa(nome_canonico), dor_curso(curso)',
      )
      .eq('status_dor', 'publicada')
      .is('deleted_at', null)
      .order('publicada_em', { ascending: false })
      .limit(50)

    if (error || !data) return []

    return data.map((row) => {
      const emp = Array.isArray(row.empresa) ? row.empresa[0] : row.empresa
      const cursos = (row.dor_curso ?? []).map((dc: { curso: string }) => dc.curso)
      return {
        id: row.id as string,
        descricao: row.descricao as string,
        empresa_nome: (emp?.nome_canonico as string | undefined) ?? '—',
        cursos,
        publicada_em: (row.publicada_em as string | null) ?? null,
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
