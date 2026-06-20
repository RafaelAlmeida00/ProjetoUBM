'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type ActionResult = { ok: true } | { ok: false; error: string }

export interface MembroInput {
  pessoaId: string
  papelProjeto: 'host' | 'co_coordenador' | 'aluno'
  indicacaoId?: string
}

/**
 * T-O2.2 — Server Action: fechar equipe (admin).
 * Monta p_membros com chaves snake_case e chama RPC fechar_equipe.
 * Invariante de host único + host = coord indicado é do banco (RS4/RS5).
 * Nunca service_role — is_admin() verificado internamente pela RPC.
 */
export async function fecharEquipe(
  projetoId: string,
  hostPessoaId: string,
  membros: MembroInput[],
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()

    const pMembros = membros.map((m) => ({
      pessoa_id: m.pessoaId,
      papel_projeto: m.papelProjeto,
      indicacao_id: m.indicacaoId ?? null,
    }))

    const { error } = await supabase.rpc('fechar_equipe', {
      p_projeto_id: projetoId,
      p_host_pessoa_id: hostPessoaId,
      p_membros: pMembros,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-O2.2 — Server Action: trocar host do projeto (admin).
 * Chama RPC trocar_host — rebaixa host atual a co_coordenador,
 * promove novo host; mantém uq_um_host_por_projeto (RS5).
 */
export async function trocarHost(
  projetoId: string,
  novoHostPessoaId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('trocar_host', {
      p_projeto_id: projetoId,
      p_novo_host_pessoa_id: novoHostPessoaId,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * Server Action: eleger host (admin) — SEM fechar a equipe.
 * O projeto continua em em_analise (aberto a indicações); só o host fecha depois.
 */
export async function elegerHost(
  projetoId: string,
  hostPessoaId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('eleger_host', {
      p_projeto_id: projetoId,
      p_host_pessoa_id: hostPessoaId,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * Server Action: reabrir indicações (admin) — volta o projeto a em_analise de qualquer status.
 */
export async function reabrirIndicacoes(projetoId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('reabrir_indicacoes', { p_projeto_id: projetoId })
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * Server Action: remover membro da equipe (host ou admin) — não a si mesmo; o host não por aqui.
 */
export async function removerMembro(
  projetoId: string,
  pessoaId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('remover_membro', {
      p_projeto_id: projetoId,
      p_pessoa_id: pessoaId,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

function mapDbError(msg: string): string {
  if (/eleger_host exige admin|reabrir.*exige admin/i.test(msg))
    return 'Apenas administradores podem eleger host ou reabrir indicações.'
  if (/host não pode ser removido|host nao pode ser removido/i.test(msg))
    return 'O host não pode ser removido — troque o host antes.'
  if (/remover a si|a si mesmo/i.test(msg))
    return 'Você não pode remover a si mesmo da equipe.'
  if (/remover_membro exige|fechar_equipe exige o host/i.test(msg))
    return 'Apenas o host do projeto ou um administrador podem alterar a equipe.'
  if (/só em projeto em_analise|so em projeto em_analise|aberto a indica/i.test(msg))
    return 'Só é possível eleger host enquanto o projeto está aberto a indicações.'
  if (/exatamente.*host|host.*obrigatorio|escolha.*host/i.test(msg))
    return 'Escolha exatamente um host para a equipe.'
  if (/host.*coord|coord.*indicacao|novo host.*coordenador/i.test(msg))
    return 'O host deve ser um coordenador com indicação ativa neste projeto.'
  if (/duplicate key.*uq_um_host/i.test(msg))
    return 'Já existe um host ativo neste projeto.'
  if (/em_analise|janela.*fechad|projeto nao esta/i.test(msg))
    return 'O projeto não está mais em análise. Janela de indicação encerrada.'
  if (/membro.*indicacao|nao.*derivad|indicacao.*ativa/i.test(msg))
    return 'Todos os membros devem ter uma indicação ativa no projeto.'
  if (/permissao|permission|negado|denied|is_admin/i.test(msg))
    return 'Você não tem permissão para esta operação. Apenas administradores podem fechar/alterar equipes.'
  return 'Não foi possível processar a operação de equipe. Tente novamente.'
}
