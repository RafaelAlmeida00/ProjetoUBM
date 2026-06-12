'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Shape plano retornado pela RPC listar_duplicatas_possiveis():
//   a uuid, nome_a text, b uuid, nome_b text, sim real
export interface DuplicataPar {
  a: string
  nome_a: string
  b: string
  nome_b: string
  sim: number
}

export async function listarDuplicatasPosiveis(): Promise<DuplicataPar[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('listar_duplicatas_possiveis')
    if (error || !data) return []
    return data as DuplicataPar[]
  } catch {
    return []
  }
}

export async function mergeEmpresa(
  idA: string,
  idB: string,
): Promise<{ ok: boolean; log_id?: string; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    // Varredura D4: assinatura real é merge_empresa(p_loser uuid, p_winner uuid)
    const { data, error } = await supabase.rpc('merge_empresa', {
      p_loser: idA,
      p_winner: idB,
    })
    if (error) return { ok: false, error: 'Não foi possível unir as empresas.' }
    return { ok: true, log_id: (data as { log_id: string })?.log_id }
  } catch {
    return { ok: false, error: 'Não foi possível unir as empresas.' }
  }
}

export async function desfazerMerge(logId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    // Varredura D4: assinatura real é desfazer_merge(p_log uuid)
    const { error } = await supabase.rpc('desfazer_merge', { p_log: logId })
    if (error) return { ok: false, error: 'Não foi possível desfazer a união.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível desfazer a união.' }
  }
}
