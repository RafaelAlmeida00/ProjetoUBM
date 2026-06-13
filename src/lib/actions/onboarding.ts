'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasSupabaseEnv } from '@/lib/supabase/env'

export interface IdentidadeResult {
  temPapel: boolean
  papeis: string[]
}

/**
 * Server Action — lê os papéis do próprio usuário autenticado.
 * Usa RLS own-read: só retorna papéis do auth.uid() corrente.
 * Sem env Supabase (dev/test sem credenciais) → { temPapel: true, papeis: [] }
 * para NÃO forçar onboarding em ambiente de desenvolvimento/teste.
 * RN21-24 / CA24-25 / architecture D.7
 */
export async function getMinhaIdentidade(): Promise<IdentidadeResult> {
  if (!hasSupabaseEnv()) {
    return { temPapel: true, papeis: [] }
  }

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()

    if (authErr || !user) {
      // Sem sessão válida → considera sem papel para forçar onboarding
      return { temPapel: false, papeis: [] }
    }

    const { data, error } = await supabase
      .from('papel_usuario')
      .select('role')
      .eq('user_id', user.id)

    if (error) {
      // Erro de rede/RLS → otimista: não forçar onboarding (evita loop)
      return { temPapel: true, papeis: [] }
    }

    const papeis = (data ?? []).map((r: { role: string }) => r.role)
    return { temPapel: papeis.length > 0, papeis }
  } catch {
    // Erro inesperado → otimista
    return { temPapel: true, papeis: [] }
  }
}

export interface OnboardingRepresentanteInput {
  empresaId: string
  nome: string
  departamento?: string | null
  cargo?: string | null
  emailCorporativo: string
}

export interface OnboardingAlunoInput {
  nome: string
  cursoIds: string[]
}

export type OnboardingResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Server Action — onboarding self-service do representante (CA24/CA27/RN22/RN25).
 * Chama a RPC onboarding_representante (SECURITY DEFINER / D.4).
 * Cria papel + vínculo membro_empresa + nome/departamento/cargo do próprio usuário.
 * Nunca cria vínculo de outra pessoa nem concede admin/coordenador (CA30).
 */
export async function onboardingRepresentante(
  input: OnboardingRepresentanteInput,
): Promise<OnboardingResult> {
  if (!input.empresaId) {
    return { ok: false, error: 'Empresa é obrigatória para o representante.' }
  }

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { ok: false, error: 'Sessão necessária. Faça login para continuar.' }
    }

    if (!input.emailCorporativo) {
      return { ok: false, error: 'E-mail corporativo é obrigatório para o representante.' }
    }

    const { error } = await supabase.rpc('onboarding_representante', {
      p_empresa_id: input.empresaId,
      p_nome: input.nome,
      p_departamento: input.departamento ?? null,
      p_cargo: input.cargo ?? null,
      p_email_corporativo: input.emailCorporativo,
    })

    if (error) return { ok: false, error: mapError(error.message) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mapError(e instanceof Error ? e.message : String(e)) }
  }
}

/**
 * Server Action — onboarding self-service do aluno (CA25/RN23).
 * Chama a RPC onboarding_aluno (SECURITY DEFINER / D.4).
 * Cria papel + nome + vínculos aluno_curso do próprio usuário.
 * Declarar-se aluno não concede privilégio adicional (CA25/RN23).
 */
export async function onboardingAluno(
  input: OnboardingAlunoInput,
): Promise<OnboardingResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { ok: false, error: 'Sessão necessária. Faça login para continuar.' }
    }

    const { error } = await supabase.rpc('onboarding_aluno', {
      p_nome: input.nome,
      p_curso_slugs: input.cursoIds,
    })

    if (error) return { ok: false, error: mapError(error.message) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mapError(e instanceof Error ? e.message : String(e)) }
  }
}

export interface OnboardingCoordenadorInput {
  nome: string
  cursoId: string
}

/**
 * Server Action — onboarding self-service do coordenador (Onda 2 / CA29).
 * Chama a RPC onboarding_coordenador (SECURITY DEFINER).
 * Cria papel + nome + vínculo coordenador_curso pendente (aprovado=false).
 * Nunca concede aprovação automaticamente — admin aprova depois.
 */
export async function onboardingCoordenador(
  input: OnboardingCoordenadorInput,
): Promise<OnboardingResult> {
  if (!input.cursoId) {
    return { ok: false, error: 'Selecione o curso que você coordena.' }
  }

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { ok: false, error: 'Sessão necessária. Faça login para continuar.' }
    }

    const { error } = await supabase.rpc('onboarding_coordenador', {
      p_curso_id: input.cursoId,
      p_nome: input.nome,
    })

    if (error) return { ok: false, error: mapError(error.message) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mapError(e instanceof Error ? e.message : String(e)) }
  }
}

function mapError(msg: string): string {
  if (/e-mail corp|corporativo/i.test(msg))
    return 'Representante exige e-mail corporativo.'
  if (/empresa.*obrigat|empresa.*null|empresa.*inv/i.test(msg))
    return 'Selecione ou crie sua empresa para continuar.'
  if (/sess[aã]o|login/i.test(msg))
    return 'Sessão necessária. Faça login para continuar.'
  if (/permiss[aã]o|permission|negado|denied/i.test(msg))
    return 'Você não tem permissão para esta operação.'
  return 'Não foi possível concluir o onboarding. Tente novamente.'
}
