'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type StatusProjeto =
  | 'em_analise'
  | 'aprovado'
  | 'aguardando_proposta'
  | 'proposta_em_analise'
  | 'proposta_aprovada'
  | 'em_execucao'
  | 'finalizado'

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * T-O2.3 — Server Action: avançar projeto (host).
 * Chama RPC avancar_projeto — só host pode avançar aprovado→aguardando_proposta.
 * Guarda de transição é do banco (trigger + RLS — RS6).
 */
export async function avancarProjeto(projetoId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('avancar_projeto', {
      p_projeto_id: projetoId,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-O2.3 — Server Action: override de transição (admin).
 * Motivo é obrigatório no client (validação antecipada).
 * Chama RPC override_transicao — auditado via status_evento (CA18/RN19).
 */
export async function overrideTransicao(
  projetoId: string,
  novoStatus: StatusProjeto,
  motivo: string,
): Promise<ActionResult> {
  if (!motivo || motivo.trim().length === 0) {
    return { ok: false, error: 'O motivo é obrigatório para o override de transição.' }
  }
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('override_transicao', {
      p_projeto_id: projetoId,
      p_novo_status: novoStatus,
      p_motivo: motivo,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-O2.3 — Server Action: arquivar projeto (admin).
 * Soft-delete via UPDATE direto sob RLS (is_admin policy — RN20).
 * "arquivado" é deleted_at ortogonal ao status, não um estado (YAGNI/§1).
 */
export async function arquivarProjeto(projetoId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('projeto')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', projetoId)
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-O2.3 — Server Action: restaurar projeto arquivado (admin).
 * Chama RPC restore_record com allowlist inclui 'projeto' (0036/C-B5).
 */
export async function restaurarProjeto(projetoId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('restore_record', {
      p_tabela: 'projeto',
      p_id: projetoId,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

function mapDbError(msg: string): string {
  if (/host.*avanc|apenas.*host|is_project_host/i.test(msg))
    return 'Apenas o host do projeto pode avançar o status.'
  if (/transicao.*nao.*permit|guarda.*transicao|par.*invalido/i.test(msg))
    return 'Esta transição de estado não é permitida no momento.'
  if (/motivo.*obrigat/i.test(msg))
    return 'O motivo é obrigatório para o override de transição.'
  if (/tabela.*nao.*permit|restore.*allowlist/i.test(msg))
    return 'Não é possível restaurar este tipo de registro.'
  if (/permissao|permission|negado|denied|is_admin/i.test(msg))
    return 'Você não tem permissão para esta operação.'
  return 'Não foi possível processar a operação. Tente novamente.'
}
