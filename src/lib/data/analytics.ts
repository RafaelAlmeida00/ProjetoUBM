import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Tipos de retorno (derivam do banco — ver architecture.md / migrations 0077-0085)
// ---------------------------------------------------------------------------

export interface ItemRankingPublico {
  posicao: number
  nome_publico: string | null
  rotulo: string
  projetos_finalizados: number
  count: number
}

export interface RankingsPublicos {
  alunos: ItemRankingPublico[]
  coordenadores: ItemRankingPublico[]
  empresas: ItemRankingPublico[]
  atualizado_em: string | null
  outros_alunos: number
  outros_coordenadores: number
  outros_empresas: number
}

export interface MeuResumo {
  minhas_dores_publicadas: number
  projetos_membro_execucao: number
  projetos_membro_finalizados: number
  minhas_tarefas_abertas: number
}

export interface PainelEmpresa {
  dores_rascunho: number
  dores_em_moderacao: number
  dores_publicadas: number
  projetos_derivados: number
  projetos_finalizados: number
  total_projetos: number
}

export interface ItemVisaoGeral {
  curso: string
  total_projetos: number
  finalizados: number
  alunos_envolvidos: number
  taxa_finalizacao: number
}

export interface VisaoGeral {
  itens: ItemVisaoGeral[]
  atualizado_em: string | null
}

// ---------------------------------------------------------------------------
// Adapters de leitura (ADR-0001: anon key + RLS, nunca service_role)
// ---------------------------------------------------------------------------

// Row individual retornada pela RPC get_rankings_publicos()
interface RankingRow {
  tipo: string
  nome: string | null
  rotulo_papel: string | null
  rotulo_curso: string | null
  projetos_finalizados: number
  contagem: number
  atualizado_em: string | null
}

const EMPTY_RANKINGS: RankingsPublicos = {
  alunos: [],
  coordenadores: [],
  empresas: [],
  atualizado_em: null,
  outros_alunos: 0,
  outros_coordenadores: 0,
  outros_empresas: 0,
}

/**
 * Chama a RPC pública get_rankings_publicos() — anônima, zero filtro (CA12/CA17).
 * A RPC retorna TABLE(tipo, nome, rotulo_papel, rotulo_curso, projetos_finalizados, contagem, atualizado_em).
 * Este adapter agrupa as rows por tipo e monta o objeto RankingsPublicos.
 * Velocidade B (MV + carimbo).
 */
export async function obterRankingsPublicos(): Promise<RankingsPublicos> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_rankings_publicos')

  if (error) {
    console.error('[analytics] get_rankings_publicos error', error)
    return { ...EMPTY_RANKINGS }
  }

  // data é array de rows (TABLE return type no Supabase)
  const rows = (data as RankingRow[] | null) ?? []
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ...EMPTY_RANKINGS }
  }

  // atualizado_em: pega o mais recente entre todos os rows
  const atualizado_em = rows.reduce<string | null>((acc, r) => {
    if (!r.atualizado_em) return acc
    if (!acc) return r.atualizado_em
    return r.atualizado_em > acc ? r.atualizado_em : acc
  }, null)

  const toItem = (r: RankingRow, posicao: number): ItemRankingPublico => ({
    posicao,
    nome_publico: r.nome,
    rotulo: [r.rotulo_papel, r.rotulo_curso].filter(Boolean).join(' · ') || r.tipo,
    projetos_finalizados: r.projetos_finalizados,
    count: r.contagem,
  })

  const alunoRows = rows.filter((r) => r.tipo === 'aluno')
  const coordRows = rows.filter((r) => r.tipo === 'coordenador')
  const empresaRows = rows.filter((r) => r.tipo === 'empresa')

  // Top-5 visíveis (k-anonymity N=5 já aplicada no banco — HAVING count(*)>=5)
  const TOP = 5
  return {
    alunos: alunoRows.slice(0, TOP).map(toItem),
    coordenadores: coordRows.slice(0, TOP).map(toItem),
    empresas: empresaRows.slice(0, TOP).map(toItem),
    atualizado_em,
    outros_alunos: Math.max(0, alunoRows.length - TOP),
    outros_coordenadores: Math.max(0, coordRows.length - TOP),
    outros_empresas: Math.max(0, empresaRows.length - TOP),
  }
}

/**
 * Lê vw_meu_resumo (Velocidade A — fresco, sem carimbo — CA1/CA3).
 * RLS filtra por auth.uid(); o front não re-filtra (RN4).
 */
export async function obterMeuResumo(): Promise<MeuResumo | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('vw_meu_resumo').select('*').single()

  if (error) {
    console.error('[analytics] vw_meu_resumo error', error)
    return null
  }
  return data as MeuResumo
}

/**
 * Lê vw_painel_empresa (Velocidade A — fresco, sem carimbo — CA4/CA5a).
 * RLS filtra por membro_empresa; zero coluna de aluno (barreira no banco).
 */
export async function obterPainelEmpresa(): Promise<PainelEmpresa | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('vw_painel_empresa').select('*').single()

  if (error) {
    console.error('[analytics] vw_painel_empresa error', error)
    return null
  }
  return data as PainelEmpresa
}

/**
 * Chama a RPC get_overview() — Velocidade B (carimbo, checa papel — CA6/CA8).
 * Mapeia erro 42501 → estado .ubm-locked (aluno negado — CA8).
 * Retorna null com locked=true se papel não autorizado.
 */
export async function obterVisaoGeral(): Promise<
  | { dados: VisaoGeral; locked: false }
  | { dados: null; locked: true }
  | { dados: null; locked: false; erro: true }
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_overview')

  if (error) {
    // 42501 = insufficient_privilege (aluno negado — CA8/CA9)
    if (error.code === '42501' || error.message?.includes('42501') || error.message?.includes('forbidden')) {
      return { dados: null, locked: true }
    }
    console.error('[analytics] get_overview error', error)
    return { dados: null, locked: false, erro: true }
  }

  return {
    dados: (data as VisaoGeral) ?? { itens: [], atualizado_em: null },
    locked: false,
  }
}
