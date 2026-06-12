'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface UsuarioAdmin {
  id: string
  email: string
  papeis: string[]
  is_admin: boolean
}

export async function listarUsuarios(): Promise<UsuarioAdmin[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('listar_usuarios_admin')
    if (error || !data) return []
    return data as UsuarioAdmin[]
  } catch {
    return []
  }
}

export async function concederPapel(
  userId: string,
  papel: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('conceder_papel', {
      p_user_id: userId,
      p_role: papel,
    })
    if (error) return { ok: false, error: 'Não foi possível conceder o papel.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível conceder o papel.' }
  }
}

export async function revogarAdmin(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('admin_app')
      .delete()
      .eq('user_id', userId)
    if (error) return { ok: false, error: 'Não foi possível revogar o acesso de administrador.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível revogar o acesso de administrador.' }
  }
}
