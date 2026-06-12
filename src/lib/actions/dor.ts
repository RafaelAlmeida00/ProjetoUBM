'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  checarRateLimit,
  registrarSubmissao,
  extrairIpConfiavel,
} from '@/lib/actions/rate-limit'
import { headers } from 'next/headers'

export interface SubmeterDorLandingInput {
  empresaId: string
  descricao: string
  repNome: string
  departamento?: string
  cargo?: string
  consentimento: boolean
  consentVersion: string
  consentAt: string
  cursos?: string[]
}

export interface SubmeterDorLandingAnonInput {
  /** empresa_id resolvido via buscar_empresa; null quando empresa nova diferida ao claim (E.3) */
  empresaId?: string | null
  /** nome da empresa nova para persistir no cache (diferida ao claim — E.3) */
  empresaNome?: string | null
  descricao: string
  repNome: string
  departamento?: string
  cargo?: string
  /** e-mail corporativo do form — obrigatório no caminho anônimo (SR-A8) */
  email: string
  consentimento: boolean
  consentVersion: string
  consentAt: string
  cursos?: string[]
}

export type SubmeterDorResult =
  | { ok: true; dorId: string; claimToken?: string }
  | { ok: false; error: string }

/**
 * T-O3.1 — Server Action: submete dor pela landing (cria em_moderacao + dispara verificação).
 * Chama submeter_dor_landing + emitir_token_verificacao.
 * Requer sessão autenticada (RN16 / gate da landing).
 */
export async function submeterDorLanding(
  input: SubmeterDorLandingInput,
): Promise<SubmeterDorResult> {
  try {
    const supabase = await createSupabaseServerClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { ok: false, error: 'Sessão necessária. Faça login para continuar.' }
    }

    // Chama a RPC submeter_dor_landing (cria dor em_moderacao + registra autor como representante).
    // I3: os cursos vão como p_cursos e são inseridos DENTRO da RPC (SECURITY DEFINER bypassa a
    //     policy dor_curso_insert_autor, que exige esta_verificado() — o autor da landing ainda não
    //     verificou). O antigo loop client-side em dor_curso falhava por RLS silenciosamente.
    const { data, error } = await supabase.rpc('submeter_dor_landing', {
      p_empresa_id: input.empresaId,
      p_descricao: input.descricao,
      p_rep_nome: input.repNome,
      p_departamento: input.departamento ?? null,
      p_cargo: input.cargo ?? null,
      p_consentimento: input.consentimento,
      p_consent_version: input.consentVersion,
      p_consent_at: input.consentAt,
      p_cursos: input.cursos && input.cursos.length > 0 ? input.cursos : null,
    })

    if (error) {
      return { ok: false, error: mapDbError(error.message) }
    }

    const dorId = (data as { dor_id?: string })?.dor_id ?? (data as string)

    // Dispara verificação de conta (gate: autor precisa verificar para publicar)
    await supabase.rpc('emitir_token_verificacao', {})

    return { ok: true, dorId: dorId as string }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-AN11/T-AN12 — Server Action: submete dor anonimamente (sem sessão).
 * Aplica rate-limit por IP antes de chamar a RPC (SR-A3).
 * Chama submeter_dor_landing com ramo anon (p_email obrigatório, autor_id=null).
 * NÃO exige sessão; a RPC DEFINER valida e-mail corporativo server-side (SR-A8).
 */
export async function submeterDorLandingAnon(
  input: SubmeterDorLandingAnonInput,
): Promise<SubmeterDorResult> {
  try {
    // Rate-limit na borda (SR-A3 [DURO]): IP NÃO-spoofável (rightmost/plataforma — T-AN11b)
    // + chave secundária por e-mail (rotação de IP não escapa do teto por e-mail).
    const hdrs = await headers()
    const ip = extrairIpConfiavel((name) => hdrs.get(name))

    const rl = checarRateLimit(ip, input.email)
    if (!rl.ok) {
      return { ok: false, error: rl.error }
    }

    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase.rpc('submeter_dor_landing', {
      p_empresa_id: input.empresaId ?? null,
      p_descricao: input.descricao,
      p_rep_nome: input.repNome,
      p_departamento: input.departamento ?? null,
      p_cargo: input.cargo ?? null,
      p_consentimento: input.consentimento,
      p_consent_version: input.consentVersion,
      p_consent_at: input.consentAt,
      p_cursos: input.cursos && input.cursos.length > 0 ? input.cursos : null,
      // Parâmetros novos da assinatura estendida (0040 — E.2)
      p_email: input.email,
      p_empresa_nome: input.empresaNome ?? null,
    })

    if (error) {
      return { ok: false, error: mapDbError(error.message) }
    }

    const row = (data as { out_dor_id?: string; out_claim_token?: string }[])?.[0]
    const dorId = row?.out_dor_id
    const claimToken = row?.out_claim_token ?? undefined

    // Registra submissão bem-sucedida no rate-limiter (após RPC — não antes)
    registrarSubmissao(ip, input.email)

    return { ok: true, dorId: dorId as string, claimToken }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-AN14 — Server Action: reclamar_dor(dorId, token, empresaId?) após login OAuth.
 * Vincula a dor órfã ao auth.uid() por prova de posse via claim-token one-shot (F.5).
 *
 * Contrato migração 0042: reclamar_dor(p_dor_id, p_token, p_empresa_id default null).
 * A vinculação de empresa é feita DENTRO da RPC, após a prova de posse —
 * o update prévio de `dor.empresa_id` foi REMOVIDO (achado HIGH de security review:
 * mutate-before-authorize; a RLS real silenciava o update silenciosamente).
 *
 * O CacheSkipGate continua responsável por resolver o uuid da empresa via
 * `obterOuCriarEmpresa` antes de chamar esta action — apenas o transporte mudou:
 * o uuid é passado como parâmetro da RPC (não mais como update prévio).
 *
 * Erros mapeados de CA28 (fallback onboarding):
 * - 'token invalido: claim negado' → ok: false
 * - 'token expirado: claim negado' → ok: false
 * - 'dor sem token de claim (orfã legada)' → ok: false
 * - 'dor ja reclamada por outro usuario' → ok: false
 * - 'empresa nao encontrada: p_empresa_id invalido (0041)' → ok: false
 * - Re-claim pelo mesmo uid = no-op silencioso (RPC retorna void sem erro) → ok: true
 */
export async function reclamarDor(
  dorId: string,
  token: string,
  empresaId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const hdrs = await headers()
    const ip = extrairIpConfiavel((name) => hdrs.get(name))
    const rl = checarRateLimit(`claim:${ip}`, dorId)
    if (!rl.ok) return { ok: false, error: rl.error }

    const supabase = await createSupabaseServerClient()

    const { error } = await supabase.rpc('reclamar_dor', {
      p_dor_id: dorId,
      p_token: token,
      p_empresa_id: empresaId ?? null,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }

    registrarSubmissao(`claim:${ip}`, dorId)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-O3.4 — Server Action: moderar_dor (aprovar/rejeitar).
 * Exclusiva do admin (gate interno na RPC).
 */
export async function moderarDor(
  dorId: string,
  acao: 'aprovar' | 'rejeitar',
  motivo?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('moderar_dor', {
      p_dor_id: dorId,
      p_acao: acao,
      p_motivo: motivo ?? null,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * T-O3.3 — Server Action: submeter_dor (rascunho/rejeitada → em_moderacao).
 * Usado pelo autor para reenviar dor editada.
 */
export async function submeterDor(
  dorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('submeter_dor', { p_dor_id: dorId })
    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * Delta 3 — Server Action: criar_dor (representante logado + verificado → rascunho).
 * Chama RPC criar_dor (0049). A dor nasce com status_dor='rascunho' vinculada à empresa.
 * Gate RN19 é aplicado dentro da RPC (papel representante + conta verificada + vínculo).
 */
export async function criarDor(input: {
  empresaId: string
  descricao: string
  cursos?: string[]
  consentimento: boolean
  consentVersion: string
  consentAt: string
}): Promise<{ ok: true; dorId: string } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase.rpc('criar_dor', {
      p_empresa_id:      input.empresaId,
      p_descricao:       input.descricao,
      p_consentimento:   input.consentimento,
      p_consent_version: input.consentVersion,
      p_consent_at:      input.consentAt,
      p_cursos:          input.cursos && input.cursos.length > 0 ? input.cursos : null,
    })

    if (error) return { ok: false, error: mapDbError(error.message) }

    const dorId = (data as string) ?? (data as { id?: string })?.id
    return { ok: true, dorId: dorId as string }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

/**
 * Delta 3 — Server Action: editar_dor (autor em rascunho/rejeitada atualiza conteúdo).
 * Chama RPC editar_dor (0049). A RPC valida autoria e estado (RN5).
 * Se cursos for fornecido, substitui o conjunto (delete+insert dedup — RN8).
 */
export async function editarDor(input: {
  dorId: string
  descricao: string
  cursos?: string[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase.rpc('editar_dor', {
      p_dor_id:    input.dorId,
      p_descricao: input.descricao,
      p_cursos:    input.cursos && input.cursos.length > 0 ? input.cursos : null,
    })

    if (error) return { ok: false, error: mapDbError(error.message) }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

function mapDbError(msg: string): string {
  if (/token.*obrigat|token.*invalid|token.*expirado|sem token/i.test(msg))
    return 'Link de verificação inválido ou expirado. Solicite um novo.'
  if (/empresa.*obrigat|empresa.*null/i.test(msg))
    return 'Selecione ou crie sua empresa para continuar.'
  if (/empresa nao encontrada.*p_empresa_id/i.test(msg))
    return 'Empresa não encontrada. Verifique os dados e tente novamente.'
  if (/usuario nao e representante desta empresa/i.test(msg))
    return 'Você não é representante desta empresa.'
  if (/dor nao editavel/i.test(msg))
    return 'Esta dor não pode ser editada no estado atual.'
  if (/corporativo/i.test(msg))
    return 'Use o e-mail corporativo da sua empresa para enviar (e-mails pessoais não são aceitos).'
  if (/consent/i.test(msg))
    return 'Consentimento LGPD é obrigatório para enviar.'
  if (/conta nao verificada/i.test(msg))
    return 'Sua conta precisa ser verificada antes de criar dores.'
  if (/nao e representante/i.test(msg))
    return 'Apenas representantes de empresas podem criar dores.'
  if (/permissao|permission|negado|denied/i.test(msg))
    return 'Você não tem permissão para esta operação.'
  if (/motivo.*obrigat/i.test(msg))
    return 'O motivo é obrigatório para rejeitar.'
  return 'Não foi possível enviar agora. Tente novamente.'
}
