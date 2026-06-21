'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type ActionResult = { ok: true } | { ok: false; error: string }
export type CriarTarefaResult = { ok: true; tarefaId: string } | { ok: false; error: string }

export interface CriarTarefaInput {
  projetoId: string
  responsavelId: string
  titulo: string
  descricao?: string
}

export interface EditarTarefaInput {
  id: string
  titulo?: string
  descricao?: string
  responsavelId?: string
}

/**
 * T-O2.4 — Server Action: criar função/tarefa no projeto.
 * INSERT direto em funcao_tarefa sob RLS — membro+admin inserem; não-membro negado (CA22).
 */
export async function criarTarefa(input: CriarTarefaInput): Promise<CriarTarefaResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.from('funcao_tarefa').insert({
      projeto_id: input.projetoId,
      responsavel_id: input.responsavelId,
      titulo: input.titulo,
      ...(input.descricao !== undefined && { descricao: input.descricao }),
    })
      .select('id')
      .single()
    if (error) return { ok: false, error: mapDbError(error.message) }
    const id = (data as { id?: string } | null)?.id ?? ''
    revalidatePath('/app/dores', 'layout')
    revalidatePath('/app', 'page')
    return { ok: true, tarefaId: id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-O2.4 — Server Action: editar título/descrição da tarefa.
 * UPDATE sob RLS — aluno edita as próprias; host/co editam as de todos (CA20/RN22).
 * Aplica somente os campos fornecidos para não sobrescrever com undefined.
 */
export async function editarTarefa(input: EditarTarefaInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()

    const payload: Record<string, unknown> = {}
    if (input.titulo !== undefined) payload.titulo = input.titulo
    if (input.descricao !== undefined) payload.descricao = input.descricao
    if (input.responsavelId !== undefined) payload.responsavel_id = input.responsavelId

    const { error } = await supabase
      .from('funcao_tarefa')
      .update(payload)
      .eq('id', input.id)
    if (error) return { ok: false, error: mapDbError(error.message) }
    revalidatePath('/app/dores', 'layout')
    revalidatePath('/app', 'page')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-O2.4 — Server Action: marcar tarefa como concluída.
 * UPDATE concluida=true sob RLS — responsável ou host/co (CA20/RN22).
 */
export async function concluirTarefa(tarefaId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('funcao_tarefa')
      .update({ concluida: true })
      .eq('id', tarefaId)
    if (error) return { ok: false, error: mapDbError(error.message) }
    revalidatePath('/app/dores', 'layout')
    revalidatePath('/app', 'page')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-O2.4 — Server Action: reatribuir tarefa a outro membro.
 * Apenas host/co_coordenador podem reatribuir (RLS garante — CA21/RN22).
 */
export async function reatribuirTarefa(
  tarefaId: string,
  novoResponsavelId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('funcao_tarefa')
      .update({ responsavel_id: novoResponsavelId })
      .eq('id', tarefaId)
    if (error) return { ok: false, error: mapDbError(error.message) }
    revalidatePath('/app/dores', 'layout')
    revalidatePath('/app', 'page')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

function mapDbError(msg: string): string {
  if (/titulo.*check|check.*titulo|length.*titulo/i.test(msg))
    return 'O título da tarefa não pode estar vazio.'
  if (/permissao|permission|negado|denied/i.test(msg))
    return 'Você não tem permissão para editar esta tarefa. Apenas o responsável, coordenadores ou host podem fazê-lo.'
  return 'Não foi possível processar a operação na tarefa. Tente novamente.'
}
