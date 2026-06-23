import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  toMeuResumo,
  toPainelEmpresa,
  toVisaoGeral,
  toRankingsPublicos,
  type MeuResumoRow,
  type PainelEmpresaRow,
  type OverviewRow,
  type RankingRow,
} from '@/lib/analytics/mapeadores'

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
 * Agrupa as rows por tipo via toRankingsPublicos (mapeador explícito — BL-001).
 * Velocidade B (MV + carimbo).
 */
export async function obterRankingsPublicos(): Promise<RankingsPublicos> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_rankings_publicos')

  if (error) {
    console.error('[analytics] get_rankings_publicos error', error)
    return { ...EMPTY_RANKINGS }
  }

  return toRankingsPublicos((data as RankingRow[] | null) ?? [])
}

/**
 * Lê vw_meu_resumo (Velocidade A — fresco, sem carimbo — CA1/CA3).
 * RLS filtra por auth.uid(); o front não re-filtra (RN4).
 * Usa toMeuResumo para mapear colunas reais → domínio (BL-001 C1).
 */
export async function obterMeuResumo(): Promise<MeuResumo | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('vw_meu_resumo').select('*').single()

  if (error) {
    console.error('[analytics] vw_meu_resumo error', error)
    return null
  }
  return toMeuResumo(data as MeuResumoRow)
}

/**
 * Lê vw_painel_empresa (Velocidade A — fresco, sem carimbo — CA4/CA5a).
 * RLS filtra por membro_empresa; zero coluna de aluno (barreira no banco).
 * Usa toPainelEmpresa para derivar total_projetos (BL-001 C2).
 */
export async function obterPainelEmpresa(): Promise<PainelEmpresa | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('vw_painel_empresa').select('*').single()

  if (error) {
    console.error('[analytics] vw_painel_empresa error', error)
    return null
  }
  return toPainelEmpresa(data as PainelEmpresaRow)
}

/**
 * Chama a RPC get_overview() — Velocidade B (carimbo, checa papel — CA6/CA8).
 * Mapeia erro 42501 → estado .ubm-locked (aluno negado — CA8).
 * Usa toVisaoGeral para montar {itens, atualizado_em} a partir do array (BL-001 C3+C4).
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
    dados: toVisaoGeral((data as OverviewRow[] | null) ?? []),
    locked: false,
  }
}
