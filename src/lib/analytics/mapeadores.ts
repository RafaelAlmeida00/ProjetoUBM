/**
 * Mapeadores puros: shape do banco → tipo de domínio.
 *
 * REGRAS:
 * - Sem `server-only` (importável em testes node sem stub).
 * - Sem import de supabase (funções puras — só tipos e transformações).
 * - Cada função recebe a row REAL do banco e devolve o tipo de domínio.
 * - Os nomes "Row" refletem as colunas exatas das views/RPCs (migrations 0079/0080/0083).
 *
 * BL-001 C1–C4: elimina o cast cego "data as T" que silenciava descasamentos.
 */

import type {
  MeuResumo,
  PainelEmpresa,
  ItemVisaoGeral,
  VisaoGeral,
  ItemRankingPublico,
  RankingsPublicos,
} from '@/lib/data/analytics'

// ---------------------------------------------------------------------------
// Tipos Row — shape REAL do banco (migrations 0079/0080/0083)
// ---------------------------------------------------------------------------

/** vw_meu_resumo — migration 0079_vw_velocidade_a.sql */
export interface MeuResumoRow {
  dores_publicadas:      string | number
  projetos_em_execucao:  string | number
  projetos_finalizados:  string | number
  tarefas_abertas:       string | number
}

/** vw_painel_empresa — migration 0079_vw_velocidade_a.sql */
export interface PainelEmpresaRow {
  empresa_id:          string
  dores_rascunho:      string | number
  dores_em_moderacao:  string | number
  dores_publicadas:    string | number
  dores_rejeitadas:    string | number
  projetos_derivados:  string | number
  projetos_finalizados:string | number
}

/** get_overview() TABLE row — migration 0083_rpcs_analytics.sql */
export interface OverviewRow {
  curso:            string
  total_projetos:   string | number
  finalizados:      string | number
  alunos_distintos: string | number   // C4: a RPC usa alunos_distintos, não alunos_envolvidos
  taxa_finalizacao: string | number
  atualizado_em:    string | null
}

/** get_rankings_publicos() TABLE row — migration 0083_rpcs_analytics.sql */
export interface RankingRow {
  tipo:                string
  nome:                string | null
  rotulo_papel:        string | null
  rotulo_curso:        string | null
  projetos_finalizados:number
  contagem:            number
  atualizado_em:       string | null
}

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

const toNum = (v: string | number | null | undefined): number =>
  typeof v === 'number' ? v : parseInt(String(v ?? '0'), 10)

// ---------------------------------------------------------------------------
// C1 — toMeuResumo
// vw_meu_resumo.dores_publicadas → MeuResumo.minhas_dores_publicadas
// vw_meu_resumo.projetos_em_execucao → MeuResumo.projetos_membro_execucao
// vw_meu_resumo.projetos_finalizados → MeuResumo.projetos_membro_finalizados
// vw_meu_resumo.tarefas_abertas → MeuResumo.minhas_tarefas_abertas
// ---------------------------------------------------------------------------
export function toMeuResumo(row: MeuResumoRow): MeuResumo {
  return {
    minhas_dores_publicadas:     toNum(row.dores_publicadas),
    projetos_membro_execucao:    toNum(row.projetos_em_execucao),
    projetos_membro_finalizados: toNum(row.projetos_finalizados),
    minhas_tarefas_abertas:      toNum(row.tarefas_abertas),
  }
}

// ---------------------------------------------------------------------------
// C2 — toPainelEmpresa
// `total_projetos` não existe na view — deriva de projetos_derivados.
// ---------------------------------------------------------------------------
export function toPainelEmpresa(row: PainelEmpresaRow): PainelEmpresa {
  return {
    dores_rascunho:      toNum(row.dores_rascunho),
    dores_em_moderacao:  toNum(row.dores_em_moderacao),
    dores_publicadas:    toNum(row.dores_publicadas),
    projetos_derivados:  toNum(row.projetos_derivados),
    projetos_finalizados:toNum(row.projetos_finalizados),
    // C2: total_projetos inexistente no banco → deriva de projetos_derivados
    total_projetos:      toNum(row.projetos_derivados),
  }
}

// ---------------------------------------------------------------------------
// C3+C4 — toVisaoGeral
// get_overview() retorna TABLE (array de rows), não {itens, atualizado_em}.
// C4: coluna do banco = alunos_distintos → domínio = alunos_envolvidos.
// ---------------------------------------------------------------------------
export function toVisaoGeral(rows: OverviewRow[]): VisaoGeral {
  if (rows.length === 0) {
    return { itens: [], atualizado_em: null }
  }

  const itens: ItemVisaoGeral[] = rows.map((r) => ({
    curso:             r.curso,
    total_projetos:    toNum(r.total_projetos),
    finalizados:       toNum(r.finalizados),
    alunos_envolvidos: toNum(r.alunos_distintos), // C4: alunos_distintos → alunos_envolvidos
    taxa_finalizacao:  toNum(r.taxa_finalizacao),
  }))

  return {
    itens,
    atualizado_em: rows[0]!.atualizado_em ?? null,
  }
}

// ---------------------------------------------------------------------------
// Rankings — toRankingsPublicos
// Agrupa rows por tipo; mantém bucket de coordenador pronto para C5.
// ---------------------------------------------------------------------------

const TOP = 5

const EMPTY_RANKINGS: RankingsPublicos = {
  alunos: [],
  coordenadores: [],
  empresas: [],
  atualizado_em: null,
  outros_alunos: 0,
  outros_coordenadores: 0,
  outros_empresas: 0,
}

const toItem = (r: RankingRow, posicao: number): ItemRankingPublico => ({
  posicao,
  nome_publico:        r.nome,
  rotulo:              [r.rotulo_papel, r.rotulo_curso].filter(Boolean).join(' · ') || r.tipo,
  projetos_finalizados:r.projetos_finalizados,
  count:               r.contagem,
})

export function toRankingsPublicos(rows: RankingRow[]): RankingsPublicos {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ...EMPTY_RANKINGS }
  }

  const atualizado_em = rows.reduce<string | null>((acc, r) => {
    if (!r.atualizado_em) return acc
    if (!acc) return r.atualizado_em
    return r.atualizado_em > acc ? r.atualizado_em : acc
  }, null)

  const alunoRows   = rows.filter((r) => r.tipo === 'aluno')
  const coordRows   = rows.filter((r) => r.tipo === 'coordenador')
  const empresaRows = rows.filter((r) => r.tipo === 'empresa')

  return {
    alunos:       alunoRows.slice(0, TOP).map(toItem),
    coordenadores:coordRows.slice(0, TOP).map(toItem),
    empresas:     empresaRows.slice(0, TOP).map(toItem),
    atualizado_em,
    outros_alunos:        Math.max(0, alunoRows.length - TOP),
    outros_coordenadores: Math.max(0, coordRows.length - TOP),
    outros_empresas:      Math.max(0, empresaRows.length - TOP),
  }
}
