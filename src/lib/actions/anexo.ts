'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface AnexoMeta {
  id: string
  nome_original: string
  mime_type: string
  tamanho_bytes: number
}

/**
 * Registra metadados de um anexo já enviado ao Storage pelo cliente.
 * O upload binário real ocorre no cliente (createSupabaseBrowserClient),
 * esta action só persiste os metadados em anexo_dor e valida permissão.
 */
export async function uploadAnexo(
  dorId: string,
  storagePath: string,
  meta: Pick<AnexoMeta, 'nome_original' | 'mime_type' | 'tamanho_bytes'>,
): Promise<{ ok: true; anexo: AnexoMeta } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient()

    // Resolve sessão server-side (nunca confiar em client-supplied user_id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false, error: 'Sessão necessária.' }
    }

    const { data, error } = await supabase
      .from('anexo_dor')
      .insert({
        dor_id: dorId,
        storage_path: storagePath,
        nome_original: meta.nome_original,
        mime_type: meta.mime_type,
        tamanho_bytes: meta.tamanho_bytes,
        enviado_por: user.id,  // NOT NULL + RLS with_check: enviado_por = auth.uid()
      })
      .select('id, nome_original, mime_type, tamanho_bytes')
      .single()

    if (error) {
      return { ok: false, error: mapAnexoError(error.message) }
    }
    revalidatePath('/app/dores/' + dorId)
    revalidatePath('/app/dores', 'layout')
    return { ok: true, anexo: data as AnexoMeta }
  } catch (e) {
    return { ok: false, error: 'Não foi possível registrar o anexo.' }
  }
}

/**
 * Remove um anexo do banco (soft-delete). O Storage é limpo pelo trigger/função no banco.
 * Válido para o autor (dor editável) e para admin (auditado).
 */
export async function removerAnexo(
  anexoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('anexo_dor')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', anexoId)
    if (error) return { ok: false, error: mapAnexoError(error.message) }
    revalidatePath('/app/dores', 'layout')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível remover o anexo.' }
  }
}

function mapAnexoError(msg: string): string {
  if (/quantidade|max.*5|5.*arquivo/i.test(msg))
    return 'Limite de 5 arquivos atingido.'
  if (/mime|tipo/i.test(msg))
    return 'Tipo não permitido.'
  if (/tamanho|size|5.*mb/i.test(msg))
    return 'Arquivo muito grande (máx. 5 MB).'
  if (/permissao|denied/i.test(msg))
    return 'Você não tem permissão para esta operação.'
  return 'Não foi possível processar o anexo.'
}
