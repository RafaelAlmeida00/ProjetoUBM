'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type Papel = 'aluno' | 'coordenador' | 'representante'

/**
 * Server Action fina — chama a RPC assumir_papel no Supabase.
 * Sem env Supabase → retorna ok simulado (dev/test).
 */
export async function assumirPapel(papel: Papel): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    // D4: a assinatura real é assumir_papel(p_role app_role) — não p_papel.
    // Com p_papel, PostgREST retorna HTTP 404 → papel nunca criado no onboarding.
    const { error } = await supabase.rpc('assumir_papel', { p_role: papel })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não conseguimos definir seu papel. Tente novamente.' }
  }
}
