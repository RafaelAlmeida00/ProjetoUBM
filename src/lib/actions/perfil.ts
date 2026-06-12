'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ── atualizarPerfil ────────────────────────────────────────────────────────────

export interface AtualizarPerfilInput {
  nomePublico: string
  rankingOptin?: boolean
}

type AtualizarPerfilResult = { ok: true } | { ok: false; error: string }

/**
 * Server Action — atualiza perfil do usuário autenticado (nome_publico / ranking_optin).
 * DML direto sob RLS perfil_update (user_id = auth.uid()); sem RPC necessária.
 */
export async function atualizarPerfil(
  input: AtualizarPerfilInput,
): Promise<AtualizarPerfilResult> {
  const { nomePublico, rankingOptin } = input
  const nomeTrimado = nomePublico.trim()

  if (nomeTrimado.length < 2) {
    return { ok: false, error: 'Informe um nome com pelo menos 2 caracteres.' }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'Sessão necessária. Faça login e tente novamente.' }
  }

  const payload: Record<string, unknown> = { nome_publico: nomeTrimado }
  if (rankingOptin !== undefined) payload.ranking_optin = rankingOptin

  const { error } = await supabase
    .from('perfil')
    .update(payload)
    .eq('user_id', user.id)

  if (error) {
    if (error.message.includes('permission denied')) {
      return { ok: false, error: 'Sem permissão para atualizar este perfil.' }
    }
    return { ok: false, error: 'Não foi possível salvar o perfil. Tente novamente.' }
  }

  return { ok: true }
}

// ── getPerfilAction ────────────────────────────────────────────────────────────

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
