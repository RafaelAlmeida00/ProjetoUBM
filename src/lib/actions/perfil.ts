'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface PerfilData {
  nome_publico: string | null
  verificado: boolean
  ranking_optin: boolean
}

/**
 * Server Action — lê perfil do usuário autenticado.
 * Pode ser chamada de Client Component (via 'use server').
 */
export async function getPerfilAction(): Promise<PerfilData | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('perfil')
      .select('nome_publico, verificado_em, ranking_optin')
      .eq('user_id', user.id)
      .single()

    if (error || !data) return null
    const row = data as { nome_publico: string | null; verificado_em: string | null; ranking_optin: boolean }
    return {
      nome_publico: row.nome_publico,
      verificado: Boolean(row.verificado_em),
      ranking_optin: Boolean(row.ranking_optin),
    }
  } catch {
    return null
  }
}
