'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface EmpresaResult {
  id: string
  nome: string
  n_dores?: number
  cidade?: string
  /**
   * Sentinel para o fluxo anônimo da landing (RN26/CA26 / architecture D.6):
   * quando criar=true e id='__criar__', a empresa ainda não existe no banco —
   * será criada no submit pós-login via obterOuCriarEmpresa dentro da Server Action.
   */
  criar?: true
}

/**
 * Busca empresas pelo nome (debounce no cliente, ~250ms).
 * Anônimo pode buscar (RLS permite SELECT em empresa para anon).
 *
 * B-003(a): a assinatura real da RPC é buscar_empresa(q text) — não p_query.
 * Usar p_query causava HTTP 404 silencioso (PostgREST não encontrava a sobrecarga).
 */
export async function buscarEmpresa(q: string): Promise<EmpresaResult[]> {
  if (!q || q.trim().length < 2) return []
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('buscar_empresa', { q: q.trim() })
    if (error || !data) return []
    // A RPC buscar_empresa retorna { id, nome_canonico, sim } — o contrato EmpresaResult usa
    // `nome`. Sem este mapeamento, o nome vinha undefined (itens em branco no combobox).
    return (data as { id: string; nome_canonico: string }[]).map((r) => ({
      id: r.id,
      nome: r.nome_canonico,
    }))
  } catch {
    return []
  }
}

export type ObterOuCriarResult =
  | { ok: true; empresa: EmpresaResult }
  | { ok: false; error: string }

/**
 * Obtém empresa existente ou cria uma nova pelo nome (nunca texto livre na FK).
 * Exige sessão autenticada.
 *
 * B-003(b): a RPC obter_ou_criar_empresa (migração 0012) devolve uuid puro (scalar),
 * não um objeto. A action normaliza para { id, nome }.
 *
 * D5: propaga erro mapeado em vez de retornar null opaco, para que a UI do /propor
 * mostre uma mensagem útil ao usuário em vez de "Tente novamente".
 */
export async function obterOuCriarEmpresa(nome: string): Promise<ObterOuCriarResult> {
  const nomeNormalizado = nome.trim()
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('obter_ou_criar_empresa', { p_nome: nomeNormalizado })
    if (error) return { ok: false, error: mapEmpresaError(error.message) }
    if (!data) return { ok: false, error: 'Não foi possível registrar a empresa. Tente novamente.' }
    // data é uuid puro (string scalar) — normaliza para o contrato EmpresaResult
    const id = typeof data === 'string' ? data : (data as { id?: string })?.id
    if (!id) return { ok: false, error: 'Não foi possível registrar a empresa. Tente novamente.' }
    return { ok: true, empresa: { id, nome: nomeNormalizado } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapEmpresaError(msg) }
  }
}

function mapEmpresaError(msg: string): string {
  if (/permissao|permission|negado|denied/i.test(msg))
    return 'Você não tem permissão para registrar empresas. Faça login para continuar.'
  if (/corporativo/i.test(msg))
    return 'Use o e-mail corporativo da sua empresa para criar uma empresa.'
  if (/empresa.*exist|duplicate/i.test(msg))
    return 'Esta empresa já existe. Selecione-a na lista.'
  return 'Não foi possível registrar a empresa. Tente novamente.'
}
