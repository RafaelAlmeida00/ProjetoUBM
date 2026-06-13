'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface UsuarioAdmin {
  id: string
  email: string
  nome: string
  papeis: string[]
  is_admin: boolean
  /** Vínculos de coordenação (preenchido quando papeis inclui 'coordenador') */
  cursos_coordenados?: { curso_id: string; curso_label: string }[]
}

export async function listarUsuarios(): Promise<UsuarioAdmin[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('listar_usuarios_admin')
    if (error || !data) return []
    return (data as UsuarioAdmin[]).map((u) => ({
      ...u,
      nome: u.nome || u.email,
    }))
  } catch {
    return []
  }
}

/**
 * Retorna o userId da sessão atual (para guards de self-revoke na UI).
 * Retorna null se não houver sessão.
 */
export async function obterSessaoAdmin(): Promise<{ userId: string } | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    return { userId: user.id }
  } catch {
    return null
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

/**
 * Concede acesso de administrador. Chama RPC conceder_admin (0055).
 */
export async function concederAdmin(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('conceder_admin', { p_user_id: userId })
    if (error) return { ok: false, error: 'Não foi possível conceder o acesso de administrador.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível conceder o acesso de administrador.' }
  }
}

/**
 * Revoga acesso de administrador via RPC revogar_admin (0055).
 * O banco tem guards de self-revoke e lockout (último admin) — defense-in-depth.
 * A action mantém o pre-check de self-revoke para UX amigável, mas o guard
 * real e inescapável está no banco.
 */
export async function revogarAdmin(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()

    // Pre-check UX: bloqueia self-revoke com mensagem clara antes de ir ao banco
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false, error: 'Sessão necessária.' }
    }
    if (user.id === userId) {
      return {
        ok: false,
        error: 'Você não pode revogar o seu próprio acesso de administrador.',
      }
    }

    // Guard real está no banco (0055): self-revoke + lockout último admin
    const { error } = await supabase.rpc('revogar_admin', { p_user_id: userId })
    if (error) {
      // Mapear erro de lockout do banco para mensagem amigável
      const msg = error.message?.toLowerCase() ?? ''
      if (msg.includes('ultimo admin') || msg.includes('último admin') || msg.includes('lockout')) {
        return { ok: false, error: 'A plataforma precisa de ao menos um admin' }
      }
      return { ok: false, error: 'Não foi possível revogar o acesso de administrador.' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível revogar o acesso de administrador.' }
  }
}

/**
 * Revoga um papel de usuário. Chama RPC revogar_papel (0055).
 * Para coordenador, o banco também limpa coordenador_curso atomicamente.
 */
export async function revogarPapel(
  userId: string,
  role: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('revogar_papel', {
      p_user_id: userId,
      p_role: role,
    })
    if (error) return { ok: false, error: 'Não foi possível revogar o papel.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível revogar o papel.' }
  }
}

/**
 * Concede o papel de coordenador já aprovado para um curso específico.
 * USA RPC dedicada conceder_coordenador — NÃO usar concederPapel para coordenador.
 * Isso força o curso_id obrigatório e garante aprovado=true, aprovado_por=admin.
 */
export async function concederCoordenador(
  userId: string,
  cursoId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('conceder_coordenador', {
      p_user_id: userId,
      p_curso_id: cursoId,
    })
    if (error) return { ok: false, error: 'Não foi possível conceder o papel de coordenador.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível conceder o papel de coordenador.' }
  }
}

/**
 * Edita o nome público de outro usuário (PII protegido). RPC admin_editar_perfil (0055).
 */
export async function adminEditarPerfil(
  userId: string,
  nomePublico: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('admin_editar_perfil', {
      p_user_id: userId,
      p_nome_publico: nomePublico,
    })
    if (error) return { ok: false, error: 'Não foi possível salvar o nome.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível salvar o nome.' }
  }
}

export interface CoordenadorPendente {
  id: string
  user_id: string
  nome: string
  email: string
  curso_id: string
  curso_label: string
  aprovado: boolean
}

export async function listarCoordenadoresPendentes(): Promise<CoordenadorPendente[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('listar_coordenadores_pendentes')
    if (error || !data) return []
    return data as CoordenadorPendente[]
  } catch {
    return []
  }
}

/**
 * Aprova vínculo coordenador-curso. RPC 0053 assina (p_user_id, p_curso_id) —
 * sem p_curso_id o PostgREST não resolve a função e retorna erro em runtime.
 */
export async function aprovarCoordenador(
  userId: string,
  cursoId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('aprovar_coordenador', {
      p_user_id: userId,
      p_curso_id: cursoId,
    })
    if (error) return { ok: false, error: 'Não foi possível aprovar o coordenador.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível aprovar o coordenador.' }
  }
}

/**
 * Recusa vínculo coordenador-curso pendente. RPC 0053 assina (p_user_id, p_curso_id).
 */
export async function recusarCoordenador(
  userId: string,
  cursoId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('recusar_coordenador', {
      p_user_id: userId,
      p_curso_id: cursoId,
    })
    if (error) return { ok: false, error: 'Não foi possível recusar o cadastro.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível recusar o cadastro.' }
  }
}
