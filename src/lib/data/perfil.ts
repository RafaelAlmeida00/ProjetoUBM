import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface Perfil {
  nome_publico: string | null
  verificado: boolean
  ranking_optin: boolean
}

/**
 * Lê o perfil do usuário autenticado via RSC (RLS aplica — só o próprio perfil).
 * Retorna null se não autenticado.
 *
 * B-003 fix: perfil.user_id é a PK real (era filtrado por "id").
 */
export async function getPerfil(): Promise<Perfil | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('perfil')
      .select('nome_publico, verificado_em, ranking_optin')
      .eq('user_id', user.id)
      .single()

    if (error || !data) return null
    return {
      nome_publico: (data as { nome_publico: string | null }).nome_publico,
      verificado: Boolean((data as { verificado_em: string | null }).verificado_em),
      ranking_optin: Boolean((data as { ranking_optin: boolean }).ranking_optin),
    }
  } catch {
    return null
  }
}
