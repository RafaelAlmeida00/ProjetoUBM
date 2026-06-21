'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface GrupoBackfill {
  grupo_id: string
  grafias: string[]
  canonico_sugerido: { id: string; nome: string }
}

export async function proposeBackfillEmpresas(): Promise<GrupoBackfill[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('propor_backfill_empresas')
    if (error || !data) return []
    return data as GrupoBackfill[]
  } catch {
    return []
  }
}

export async function fixarGrupo(
  grupoId: string,
  canonicoId?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('aplicar_backfill_grupo', {
      p_grupo_id: grupoId,
      p_canonico_id: canonicoId ?? null,
    })
    if (error) return { ok: false, error: 'Não foi possível fixar o grupo.' }
    revalidatePath('/admin/backfill')
    revalidatePath('/admin/empresas')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível fixar o grupo.' }
  }
}
