'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * T-O2.1 — Server Action: auto-indicação ao projeto.
 * Chama RPC indicar_se (pessoa_id = auth.uid() imposto pelo banco — RS3).
 * Gate de verificação e janela em_analise são do banco (RN8/RN9).
 */
export async function indicarSe(
  projetoId: string,
  papelPretendido: 'aluno' | 'coordenador',
  mensagem?: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('indicar_se', {
      p_projeto_id: projetoId,
      p_papel_pretendido: papelPretendido,
      p_mensagem: mensagem ?? null,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }
    revalidatePath('/app/dores')
    revalidatePath('/app/dores', 'layout')
    revalidatePath('/app', 'page')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-O2.1 — Server Action: retirar a própria indicação (soft-delete via RPC).
 * Chama RPC retirar_indicacao.
 */
export async function retirarIndicacao(
  projetoId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('retirar_indicacao', {
      p_projeto_id: projetoId,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }
    revalidatePath('/app/dores')
    revalidatePath('/app/dores', 'layout')
    revalidatePath('/app', 'page')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

function mapDbError(msg: string): string {
  if (/verific|esta_verificado/i.test(msg))
    return 'Sua conta precisa estar verificada para se indicar.'
  if (/em_analise|nao.*analise|janela.*fechad|indicacao.*fechad/i.test(msg))
    return 'A indicação não está mais aberta para este projeto.'
  if (/duplicate key.*uq_indicacao|indicacao.*ativa|ja.*indicad/i.test(msg))
    return 'Você já possui uma indicação ativa para este projeto.'
  if (/indicacao.*nao.*encontrad/i.test(msg))
    return 'Indicação não encontrada ou já retirada.'
  if (/permissao|permission|negado|denied/i.test(msg))
    return 'Você não tem permissão para esta operação.'
  return 'Não foi possível processar a indicação. Tente novamente.'
}
