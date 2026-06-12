import { createSupabaseServerClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Tipos de retorno dos adapters de leitura RSC (T-O2.5)
// ---------------------------------------------------------------------------

export interface ProjetoVitrine {
  id: string
  status: string
  dor_id: string
  [key: string]: unknown
}

/**
 * Membro retornado pela RPC equipe_publica — nunca contém pessoa_id/user_id cru (RS9).
 * nome_ou_papel: nome real (se ranking_optin=true) ou "papel · curso" (se false).
 */
export interface MembroPublico {
  papel_projeto: 'host' | 'co_coordenador' | 'aluno'
  nome_ou_papel: string
  ranking_optin: boolean
  [key: string]: unknown
}

export interface EventoTimeline {
  de_status: string | null
  para_status: string
  ocorrido_em: string
  [key: string]: unknown
}

export interface Indicacao {
  id: string
  projeto_id: string
  pessoa_id: string
  papel_pretendido: 'aluno' | 'coordenador'
  mensagem: string | null
  created_at: string
  deleted_at: string | null
  [key: string]: unknown
}

export interface FuncaoTarefa {
  id: string
  projeto_id: string
  responsavel_id: string
  titulo: string
  descricao: string | null
  concluida: boolean
  created_at: string
  deleted_at: string | null
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// T-O2.5 — Queries de leitura RSC
// ---------------------------------------------------------------------------

/**
 * Lista projetos para a vitrine pública (/casos).
 * Lê de `projeto` sob RLS pública (deleted_at is null).
 * NUNCA faz select de `perfil` para anon — nomes vêm via obterEquipePublica (RPC).
 */
export async function listarProjetosVitrine(): Promise<ProjetoVitrine[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('projeto')
      .select('id, status, dor_id, aprovado_em, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error || !data) return []
    return data as ProjetoVitrine[]
  } catch {
    return []
  }
}

/**
 * Obtém equipe pública de um projeto via RPC equipe_publica.
 * RPC é SECURITY DEFINER — projeção explícita, NUNCA retorna pessoa_id/user_id cru (RS9).
 * Nome: só com ranking_optin=true; senão papel+curso.
 */
export async function obterEquipePublica(projetoId: string): Promise<MembroPublico[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('equipe_publica', {
      p_projeto_id: projetoId,
    })
    if (error || !data) return []
    return data as MembroPublico[]
  } catch {
    return []
  }
}

/**
 * Obtém timeline pública de um projeto via RPC timeline_publica.
 * RPC pública acessível por anon + authenticated.
 * NUNCA faz select de `perfil` direto para anon (RS9).
 */
export async function obterTimelinePublica(projetoId: string): Promise<EventoTimeline[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('timeline_publica', {
      p_projeto_id: projetoId,
    })
    if (error || !data) return []
    return data as EventoTimeline[]
  } catch {
    return []
  }
}

/**
 * Lista indicações de um projeto (autenticado, RLS aplica).
 * Visível: coordenador-do-curso-da-dor + admin + própria (RN25/CA25).
 */
export async function listarIndicacoes(projetoId: string): Promise<Indicacao[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('indicacao')
      .select(
        'id, projeto_id, pessoa_id, papel_pretendido, mensagem, created_at, deleted_at',
      )
      .eq('projeto_id', projetoId)
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data as Indicacao[]
  } catch {
    return []
  }
}

/**
 * Lista funções/tarefas de um projeto (membros sob RLS — CA20/RN22).
 * Aluno vê as suas; host/co veem todas; não-membro = negado.
 */
export async function listarFuncoesTarefas(projetoId: string): Promise<FuncaoTarefa[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('funcao_tarefa')
      .select(
        'id, projeto_id, responsavel_id, titulo, descricao, concluida, created_at, deleted_at',
      )
      .eq('projeto_id', projetoId)
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data as FuncaoTarefa[]
  } catch {
    return []
  }
}
