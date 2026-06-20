import { createSupabaseServerClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Tipos de retorno dos adapters de leitura RSC (T-O2.5)
// ---------------------------------------------------------------------------

export interface ProjetoVitrine {
  id: string
  status: string
  dor_id: string
  /** Título do projeto (vem da dor; pode ser null em projetos legados → UI cai no fallback). */
  titulo: string | null
  empresa_nome: string
  host_coordenador_id: string | null
  [key: string]: unknown
}

/**
 * Membro retornado pela RPC equipe_publica — nunca contém pessoa_id/user_id cru (RS9).
 * nome_ou_papel: nome real (se ranking_optin=true) ou "papel · curso" (se false).
 */
export interface MembroPublico {
  papel_projeto: 'host' | 'co_coordenador' | 'aluno'
  nome_ou_papel: string
  /** true quando nome_ou_papel é o NOME real (revelado p/ audiência interna ou opt-in público);
   *  false quando é o fallback "Papel · curso" (vitrine anon sem opt-in). */
  nome_revelado: boolean
  ranking_optin: boolean
  curso?: string | null
  [key: string]: unknown
}

export interface EventoTimeline {
  de_status: string | null
  para_status: string
  ocorrido_em: string
  motivo?: string | null
  /** nome do autor da transição — revelado p/ audiência interna ou opt-in; null caso contrário. */
  autor_nome?: string | null
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
  // campos de identidade retornados pela RPC indicacoes_coordenador (Bug #6)
  aluno_nome: string
  aluno_email: string
  curso: string
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
// Onda 2 — B5: enriquecimento de projetos com dados da dor (empresa, descrição, cursos)
// ---------------------------------------------------------------------------

export interface ProjetoEnriquecido {
  projetoId: string
  dorId: string
  titulo: string | null
  empresa_nome: string
  descricao: string
  cursos: string[]
  status: string
}

interface DorResumida {
  id: string
  titulo?: string | null
  empresa_nome: string
  descricao: string
  cursos: string[]
}

/**
 * Combina uma lista de projetos com os dados das dores correspondentes.
 * Função pura — sem I/O. Usada pelo RSC /app/indicacoes após buscar dores separadamente.
 * Projetos sem dor correspondente retornam com strings vazias (não quebram o render).
 */
export function enriquecerProjetosComDor(
  projetos: Array<{ id: string; dor_id: string; status: string }>,
  dores: DorResumida[],
): ProjetoEnriquecido[] {
  const dorMap = new Map(dores.map((d) => [d.id, d]))
  return projetos.map((p) => {
    const dor = dorMap.get(p.dor_id)
    return {
      projetoId: p.id,
      dorId: p.dor_id,
      titulo: dor?.titulo ?? null,
      empresa_nome: dor?.empresa_nome ?? '',
      descricao: dor?.descricao ?? '',
      cursos: dor?.cursos ?? [],
      status: p.status,
    }
  })
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
      .select('id, status, dor_id, aprovado_em, created_at, host_coordenador_id, dor:dor(titulo, empresa:empresa(nome_canonico))')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error || !data) return []
    return (data as unknown as Array<{
      id: string; status: string; dor_id: string; host_coordenador_id: string | null
      dor: { titulo: string | null; empresa: { nome_canonico: string } | { nome_canonico: string }[] | null } | { titulo: string | null; empresa: { nome_canonico: string } | null }[] | null
    }>).map((row) => {
      const dor = Array.isArray(row.dor) ? row.dor[0] : row.dor
      const emp = dor ? (Array.isArray(dor.empresa) ? dor.empresa[0] : dor.empresa) : null
      return {
        id: row.id,
        status: row.status,
        dor_id: row.dor_id,
        titulo: dor?.titulo ?? null,
        empresa_nome: emp?.nome_canonico ?? '',
        host_coordenador_id: row.host_coordenador_id ?? null,
      }
    })
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
 * Lista indicações de um projeto com identidade do candidato (Bug #6).
 * Delega à RPC indicacoes_coordenador (SECURITY DEFINER):
 *   - coord-do-curso-da-dor e admin: recebem aluno_nome, aluno_email, curso.
 *   - demais papéis: RPC retorna vazio silenciosamente (CA25/RS9).
 */
export async function listarIndicacoes(projetoId: string): Promise<Indicacao[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('indicacoes_coordenador', {
      p_projeto_id: projetoId,
    })
    if (error || !data) return []
    return data as Indicacao[]
  } catch {
    return []
  }
}

/**
 * Retorna os IDs de projetos onde o usuário logado já está indicado (indicacao ativa)
 * ou já é membro da equipe (membro_equipe ativo). Usado pelo FE para esconder/derivar o
 * slot "Me indicar" nos cards de dor (Onda 2).
 *
 * SEGURANÇA (RS9): filtra `pessoa_id = auth.uid()` EXPLICITAMENTE — NÃO confia só no RLS.
 * `indicacao` tem `indicacao_select_coord` (coordenador-do-curso/admin lê indicações de
 * terceiros) e `membro_equipe` tem `membro_equipe_select_publica` (deleted_at is null → PÚBLICA).
 * Sem o `.eq('pessoa_id', uid)` o coordenador (ou qualquer usuário) veria vínculos alheios como
 * seus — era a causa do bug "/app/dores mostra 'já indicado' + Retirar sem o usuário ter se indicado".
 */
export interface MeusVinculosProjeto {
  indicadoProjetoIds: string[]
  membroProjetoIds: string[]
}

export async function obterMeusVinculosProjeto(): Promise<MeusVinculosProjeto> {
  const vazio: MeusVinculosProjeto = { indicadoProjetoIds: [], membroProjetoIds: [] }
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return vazio
    const [indicacoesRes, membrosRes] = await Promise.all([
      supabase
        .from('indicacao')
        .select('projeto_id')
        .eq('pessoa_id', user.id)
        .is('deleted_at', null),
      supabase
        .from('membro_equipe')
        .select('projeto_id')
        .eq('pessoa_id', user.id)
        .is('deleted_at', null),
    ])
    const indicadoProjetoIds = (indicacoesRes.data ?? []).map((r) => r.projeto_id as string)
    const membroProjetoIds = (membrosRes.data ?? []).map((r) => r.projeto_id as string)
    return { indicadoProjetoIds, membroProjetoIds }
  } catch {
    return vazio
  }
}

/**
 * Membro para GESTÃO (admin/host) — inclui pessoa_id (id necessário p/ remover_membro).
 * Diferente de MembroPublico (anonimizado): só admin/host veem; via RPC equipe_gestao (DEFINER).
 */
export interface MembroGestao {
  pessoa_id: string
  nome: string
  papel_projeto: 'host' | 'co_coordenador' | 'aluno'
}

/**
 * Lista os membros da equipe com pessoa_id+nome para gestão (admin/host).
 * Delega à RPC equipe_gestao (gate is_admin OR is_project_host). Degrada para [].
 */
export async function listarEquipeGestao(projetoId: string): Promise<MembroGestao[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('equipe_gestao', { p_projeto_id: projetoId })
    if (error || !data) return []
    return data as MembroGestao[]
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

// ---------------------------------------------------------------------------
// ADR-0002 Q2 — Bancada: agregadores cross-projeto (RSC sob RLS do usuário)
// ---------------------------------------------------------------------------
// Princípio: RLS é o controle central. Os adapters leem tabelas diretamente;
// o banco filtra pelo auth.uid() via políticas existentes. Nenhum adapter
// reimplementa authz nem expõe PII de terceiros (RS9).

/**
 * Retorno enxuto de projeto para a bancada.
 * Não inclui PII de equipe — nomes vêm via obterEquipePublica (RPC DEFINER) quando necessário.
 */
export interface MeuProjeto {
  projeto_id: string
  dor_id: string
  status: string
  empresa_nome: string
  papel_projeto: string
}

/**
 * Lista projetos onde o usuário autenticado é membro da equipe (papel host/co/aluno).
 * SEGURANÇA (RS9): `membro_equipe_select_publica` é PÚBLICA (deleted_at is null) — NÃO isola por
 * posse. Filtra `pessoa_id = auth.uid()` EXPLICITAMENTE; sem isso a bancada listaria membros/projetos
 * de TODA a plataforma como se fossem do usuário.
 * NUNCA faz select de `perfil` de terceiros (RS9).
 * Degrada para [] em erro — bancada não quebra se este widget falhar.
 */
export async function listarMeusProjetos(): Promise<MeuProjeto[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data, error } = await supabase
      .from('membro_equipe')
      .select(
        'projeto_id, papel_projeto, projeto:projeto(id, dor_id, status, dor:dor(empresa:empresa(nome_canonico)))',
      )
      .eq('pessoa_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error || !data) return []

    return (data as unknown as Array<{
      projeto_id: string
      papel_projeto: string
      projeto: { id: string; dor_id: string; status: string; dor: { empresa: { nome_canonico: string } | null } | null } | null
    }>).map((row) => {
      const proj = Array.isArray(row.projeto) ? row.projeto[0] : row.projeto
      const dor = proj ? (Array.isArray(proj.dor) ? proj.dor[0] : proj.dor) : null
      const emp = dor ? (Array.isArray(dor.empresa) ? dor.empresa[0] : dor.empresa) : null
      return {
        projeto_id: row.projeto_id,
        dor_id: proj?.dor_id ?? '',
        status: proj?.status ?? '',
        empresa_nome: emp?.nome_canonico ?? '',
        papel_projeto: row.papel_projeto,
      }
    })
  } catch {
    return []
  }
}

/**
 * Retorno enxuto de tarefa aberta para a bancada do aluno/membro.
 */
export interface TarefaAberta {
  id: string
  projeto_id: string
  titulo: string
  descricao: string | null
  created_at: string
}

/**
 * Lista funções/tarefas atribuídas ao usuário logado que ainda não foram concluídas.
 * SEGURANÇA (RS9): `funcao_tarefa_select` libera por `is_team_member(projeto)` — qualquer membro
 * (host/co/aluno) lê TODAS as tarefas do projeto, não só as suas. Filtra `responsavel_id = auth.uid()`
 * EXPLICITAMENTE para devolver apenas as MINHAS; sem isso a bancada mostraria tarefas de colegas.
 * Degrada para [] em erro.
 */
export async function listarMinhasTarefasAbertas(): Promise<TarefaAberta[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data, error } = await supabase
      .from('funcao_tarefa')
      .select('id, projeto_id, titulo, descricao, created_at')
      .eq('responsavel_id', user.id)
      .eq('concluida', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(50)
    if (error || !data) return []
    return data as TarefaAberta[]
  } catch {
    return []
  }
}

/**
 * Retorno enxuto de indicação ativa para a bancada do aluno.
 */
export interface MinhaIndicacao {
  id: string
  projeto_id: string
  papel_pretendido: string
  created_at: string
}

/**
 * Lista indicações ativas (deleted_at is null) do próprio usuário logado.
 * SEGURANÇA (RS9): além de `indicacao_select_propria`, a tabela tem `indicacao_select_coord`
 * (coordenador-do-curso/admin lê indicações de terceiros). Filtra `pessoa_id = auth.uid()`
 * EXPLICITAMENTE; sem isso a bancada de um coordenador listaria as indicações dos alunos do curso.
 * Degrada para [] em erro.
 */
export async function listarMinhasIndicacoes(): Promise<MinhaIndicacao[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data, error } = await supabase
      .from('indicacao')
      .select('id, projeto_id, papel_pretendido, created_at')
      .eq('pessoa_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error || !data) return []
    return data as MinhaIndicacao[]
  } catch {
    return []
  }
}

/**
 * Contagem das dores do representante logado por status_dor.
 * RLS dor_update_owner aplica: autor_id = auth.uid() filtra automaticamente.
 * Retorna contagens zeradas em erro (fail-soft).
 */
export interface ContagemDoresPorStatus {
  rascunho: number
  // dor pendente de moderação = status_dor 'em_moderacao' (NÃO 'em_analise', que é status de PROJETO).
  em_moderacao: number
  publicada: number
  arquivada: number
  total: number
  [status: string]: number
}

/**
 * Conta as dores do representante logado agrupadas por status_dor.
 * SEGURANÇA (RS9): `dor_select_publica` deixa QUALQUER um ler dores publicadas — sem filtro, a
 * contagem somaria as publicadas de toda a plataforma. Filtra `autor_id = auth.uid()` EXPLICITAMENTE
 * para contar só as MINHAS (a policy `dor_select_autor` libera o autor a ver as próprias em qualquer status).
 * NUNCA faz select de `perfil` (só lê os dados da própria dor — RS9).
 * Degrada para contagens zero em erro.
 */
export async function contarMinhasDoresPorStatus(): Promise<ContagemDoresPorStatus> {
  const zero: ContagemDoresPorStatus = {
    rascunho: 0,
    em_moderacao: 0,
    publicada: 0,
    arquivada: 0,
    total: 0,
  }
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return zero
    const { data, error } = await supabase
      .from('dor')
      .select('status_dor')
      .eq('autor_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error || !data) return zero

    const contagem = { ...zero }
    for (const row of data as Array<{ status_dor: string }>) {
      const s = row.status_dor
      contagem[s] = (contagem[s] ?? 0) + 1
      contagem.total += 1
    }
    return contagem
  } catch {
    return zero
  }
}
