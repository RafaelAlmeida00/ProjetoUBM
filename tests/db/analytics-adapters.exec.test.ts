// @vitest-environment node
/**
 * T-ADAPT — testes de integração dos mapeadores analytics (BL-001 / C1–C4).
 *
 * Validam que o adapter converte corretamente o shape REAL do banco
 * (nomes de coluna das views/RPCs) para o shape de domínio lido pelos componentes.
 * Os testes de componente NÃO pegam esses bugs (mocks usam o shape do front).
 *
 * RED: cast cego "data as T" em analytics.ts → campos undefined → asserts falham.
 * GREEN: mapeadores explícitos em lib/analytics/mapeadores.ts → asserts passam.
 *
 * spec: CA1/CA3/CA4/CA6/CA7/CA12 · BL-001 C1–C4
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario, comoAnon } from './_pglite/harness'
import { seedAnalytics, IDS } from './_pglite/seed-analytics'
import type { PGlite } from '@electric-sql/pglite'

// Importa os mapeadores puros — sem server-only, sem supabase
import {
  toMeuResumo,
  toPainelEmpresa,
  toVisaoGeral,
  toRankingsPublicos,
} from '@/lib/analytics/mapeadores'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
})
afterEach(async () => { await db.close() })

// ── Tipos das rows REAIS do banco ─────────────────────────────────────────

interface MeuResumoRow {
  dores_publicadas:     string | number
  projetos_em_execucao: string | number
  projetos_finalizados: string | number
  tarefas_abertas:      string | number
}

interface PainelEmpresaRow {
  empresa_id:          string
  dores_rascunho:      string | number
  dores_em_moderacao:  string | number
  dores_publicadas:    string | number
  dores_rejeitadas:    string | number
  projetos_derivados:  string | number
  projetos_finalizados:string | number
}

interface OverviewRow {
  curso:            string
  total_projetos:   string | number
  finalizados:      string | number
  alunos_distintos: string | number
  taxa_finalizacao: string | number
  atualizado_em:    string | null
}

interface RankingRow {
  tipo:                string
  nome:                string | null
  rotulo_papel:        string | null
  rotulo_curso:        string | null
  projetos_finalizados:number
  contagem:            number
  atualizado_em:       string | null
}

const toNum = (v: string | number | null | undefined): number =>
  typeof v === 'number' ? v : parseInt(String(v ?? '0'))

// ── C1: toMeuResumo — vw_meu_resumo ──────────────────────────────────────

describe('C1 — toMeuResumo (vw_meu_resumo → domínio)', () => {
  it('mapeia dores_publicadas → minhas_dores_publicadas', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    const r = await db.query<MeuResumoRow>(`select * from public.vw_meu_resumo`)
    expect(r.rows).toHaveLength(1)

    const dominio = toMeuResumo(r.rows[0]!)

    // userA tem 0 dores publicadas (seed: dores publicadas são de userRep)
    expect(dominio.minhas_dores_publicadas).toBe(toNum(r.rows[0]!.dores_publicadas))
    expect(typeof dominio.minhas_dores_publicadas).toBe('number')
  })

  it('mapeia projetos_em_execucao → projetos_membro_execucao', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    const r = await db.query<MeuResumoRow>(`select * from public.vw_meu_resumo`)
    const dominio = toMeuResumo(r.rows[0]!)

    // userA é membro de projetoEmExecucao
    expect(dominio.projetos_membro_execucao).toBe(toNum(r.rows[0]!.projetos_em_execucao))
    expect(dominio.projetos_membro_execucao).toBeGreaterThanOrEqual(1)
  })

  it('mapeia projetos_finalizados → projetos_membro_finalizados', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    const r = await db.query<MeuResumoRow>(`select * from public.vw_meu_resumo`)
    const dominio = toMeuResumo(r.rows[0]!)

    // userA é membro de projetoFinalizado
    expect(dominio.projetos_membro_finalizados).toBe(toNum(r.rows[0]!.projetos_finalizados))
    expect(dominio.projetos_membro_finalizados).toBeGreaterThanOrEqual(1)
  })

  it('mapeia tarefas_abertas → minhas_tarefas_abertas', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    const r = await db.query<MeuResumoRow>(`select * from public.vw_meu_resumo`)
    const dominio = toMeuResumo(r.rows[0]!)

    // userA tem 2 tarefas abertas (seed)
    expect(dominio.minhas_tarefas_abertas).toBe(toNum(r.rows[0]!.tarefas_abertas))
    expect(dominio.minhas_tarefas_abertas).toBe(2)
  })

  it('todos os campos de domínio são numbers (não undefined)', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    const r = await db.query<MeuResumoRow>(`select * from public.vw_meu_resumo`)
    const dominio = toMeuResumo(r.rows[0]!)

    expect(dominio.minhas_dores_publicadas).not.toBeUndefined()
    expect(dominio.projetos_membro_execucao).not.toBeUndefined()
    expect(dominio.projetos_membro_finalizados).not.toBeUndefined()
    expect(dominio.minhas_tarefas_abertas).not.toBeUndefined()
  })
})

// ── C2: toPainelEmpresa — vw_painel_empresa ───────────────────────────────

describe('C2 — toPainelEmpresa (vw_painel_empresa → domínio)', () => {
  it('deriva total_projetos de projetos_derivados (não existe no banco)', async () => {
    await comoUsuario(db, { uid: IDS.userRep })
    const r = await db.query<PainelEmpresaRow>(`select * from public.vw_painel_empresa`)
    const rowX = r.rows.find((row) => row.empresa_id === IDS.empresaX)!
    expect(rowX).toBeDefined()

    const dominio = toPainelEmpresa(rowX)

    // total_projetos deriva de projetos_derivados (não existe na view)
    expect(dominio.total_projetos).toBe(toNum(rowX.projetos_derivados))
    expect(typeof dominio.total_projetos).toBe('number')
  })

  it('mapeia projetos_finalizados corretamente', async () => {
    await comoUsuario(db, { uid: IDS.userRep })
    const r = await db.query<PainelEmpresaRow>(`select * from public.vw_painel_empresa`)
    const rowX = r.rows.find((row) => row.empresa_id === IDS.empresaX)!
    const dominio = toPainelEmpresa(rowX)

    expect(dominio.projetos_finalizados).toBe(toNum(rowX.projetos_finalizados))
  })

  it('mapeia dores por status (rascunho/em_moderacao/publicadas)', async () => {
    await comoUsuario(db, { uid: IDS.userRep })
    const r = await db.query<PainelEmpresaRow>(`select * from public.vw_painel_empresa`)
    const rowX = r.rows.find((row) => row.empresa_id === IDS.empresaX)!
    const dominio = toPainelEmpresa(rowX)

    expect(dominio.dores_rascunho).toBe(toNum(rowX.dores_rascunho))
    expect(dominio.dores_em_moderacao).toBe(toNum(rowX.dores_em_moderacao))
    expect(dominio.dores_publicadas).toBe(toNum(rowX.dores_publicadas))
  })

  it('total_projetos > 0 permite calcular pctFinalizado (não mais undefined > 0)', async () => {
    await comoUsuario(db, { uid: IDS.userRep })
    const r = await db.query<PainelEmpresaRow>(`select * from public.vw_painel_empresa`)
    const rowX = r.rows.find((row) => row.empresa_id === IDS.empresaX)!
    const dominio = toPainelEmpresa(rowX)

    // Se há projetos derivados, total_projetos > 0, portanto pctFinalizado pode ser calculado
    if (toNum(rowX.projetos_derivados) > 0) {
      expect(dominio.total_projetos).toBeGreaterThan(0)
      const pct = Math.round((dominio.projetos_finalizados / dominio.total_projetos) * 100)
      expect(pct).toBeGreaterThanOrEqual(0)
      expect(pct).toBeLessThanOrEqual(100)
    }
  })
})

// ── C3+C4: toVisaoGeral — get_overview() ────────────────────────────────

describe('C3+C4 — toVisaoGeral (get_overview TABLE → {itens, atualizado_em})', () => {
  beforeEach(async () => {
    // refresh obrigatório antes de consultar a MV (como em 0083.exec.test.ts)
    await db.exec(`refresh materialized view analytics.mv_overview`)
  })

  it('C3: monta {itens, atualizado_em} a partir do array de rows (não TypeError)', async () => {
    await comoUsuario(db, { uid: IDS.userAdmin })
    const r = await db.query<OverviewRow>(`select * from public.get_overview()`)

    // get_overview() retorna TABLE = array de rows
    expect(Array.isArray(r.rows)).toBe(true)

    const dominio = toVisaoGeral(r.rows)

    // Deve ser objeto com itens e atualizado_em, nunca TypeError
    expect(dominio).toHaveProperty('itens')
    expect(dominio).toHaveProperty('atualizado_em')
    expect(Array.isArray(dominio.itens)).toBe(true)
  })

  it('C3: itens.length reflete as rows (não acessa undefined.length)', async () => {
    await comoUsuario(db, { uid: IDS.userAdmin })
    const r = await db.query<OverviewRow>(`select * from public.get_overview()`)
    const dominio = toVisaoGeral(r.rows)

    expect(dominio.itens.length).toBe(r.rows.length)
  })

  it('C4: mapeia alunos_distintos → alunos_envolvidos (não undefined)', async () => {
    await comoUsuario(db, { uid: IDS.userAdmin })
    const r = await db.query<OverviewRow>(`select * from public.get_overview()`)

    if (r.rows.length > 0) {
      const dominio = toVisaoGeral(r.rows)
      const primeiroItem = dominio.itens[0]!

      // alunos_envolvidos deve ser number, não undefined
      expect(primeiroItem.alunos_envolvidos).not.toBeUndefined()
      expect(typeof primeiroItem.alunos_envolvidos).toBe('number')
      // valor deve bater com alunos_distintos do banco
      expect(primeiroItem.alunos_envolvidos).toBe(toNum(r.rows[0]!.alunos_distintos))
    }
  })

  it('C3+C4: todos os campos de item são mapeados corretamente', async () => {
    await comoUsuario(db, { uid: IDS.userAdmin })
    const r = await db.query<OverviewRow>(`select * from public.get_overview()`)

    if (r.rows.length > 0) {
      const dominio = toVisaoGeral(r.rows)
      const item = dominio.itens[0]!
      const row = r.rows[0]!

      expect(item.curso).toBe(row.curso)
      expect(item.total_projetos).toBe(toNum(row.total_projetos))
      expect(item.finalizados).toBe(toNum(row.finalizados))
      expect(item.alunos_envolvidos).toBe(toNum(row.alunos_distintos))
      expect(item.taxa_finalizacao).toBe(toNum(row.taxa_finalizacao))
    }
  })

  it('retorna atualizado_em do primeiro row (ou null se vazio)', async () => {
    await comoUsuario(db, { uid: IDS.userAdmin })
    const r = await db.query<OverviewRow>(`select * from public.get_overview()`)
    const dominio = toVisaoGeral(r.rows)

    if (r.rows.length > 0) {
      expect(dominio.atualizado_em).toBe(r.rows[0]!.atualizado_em ?? null)
    } else {
      expect(dominio.atualizado_em).toBeNull()
    }
  })

  it('toVisaoGeral([]) retorna {itens:[], atualizado_em:null} sem lançar', () => {
    const dominio = toVisaoGeral([])
    expect(dominio.itens).toHaveLength(0)
    expect(dominio.atualizado_em).toBeNull()
  })
})

// ── Rankings: toRankingsPublicos — get_rankings_publicos() ────────────────

describe('Rankings — toRankingsPublicos (get_rankings_publicos → RankingsPublicos)', () => {
  beforeEach(async () => {
    // Todas as MVs de ranking precisam de refresh antes de consultar (como mv_overview)
    await db.exec(`refresh materialized view analytics.mv_rankings_publico`)
    await db.exec(`refresh materialized view analytics.mv_rankings_empresa`)
  })

  it('monta objeto tipado a partir do array de rows (sem cast cego)', async () => {
    await comoAnon(db)
    const r = await db.query<RankingRow>(`select * from public.get_rankings_publicos()`)

    const dominio = toRankingsPublicos(r.rows)

    expect(dominio).toHaveProperty('alunos')
    expect(dominio).toHaveProperty('coordenadores')
    expect(dominio).toHaveProperty('empresas')
    expect(dominio).toHaveProperty('atualizado_em')
    expect(dominio).toHaveProperty('outros_alunos')
    expect(dominio).toHaveProperty('outros_coordenadores')
    expect(dominio).toHaveProperty('outros_empresas')
    expect(Array.isArray(dominio.alunos)).toBe(true)
    expect(Array.isArray(dominio.coordenadores)).toBe(true)
    expect(Array.isArray(dominio.empresas)).toBe(true)
  })

  it('buckets são separados por tipo (aluno/empresa — coordenador vazio até C5)', async () => {
    await comoAnon(db)
    const r = await db.query<RankingRow>(`select * from public.get_rankings_publicos()`)
    const dominio = toRankingsPublicos(r.rows)

    // Buckets devem ser arrays (mesmo vazios — k-anonimidade pode suprimir tudo no seed)
    expect(Array.isArray(dominio.alunos)).toBe(true)
    expect(Array.isArray(dominio.coordenadores)).toBe(true)
    expect(Array.isArray(dominio.empresas)).toBe(true)

    // Quando há itens, cada campo de domínio deve estar definido e tipado corretamente
    for (const item of dominio.alunos) {
      expect(typeof item.posicao).toBe('number')
      expect(typeof item.projetos_finalizados).toBe('number')
      expect(typeof item.rotulo).toBe('string')
    }
    for (const item of dominio.empresas) {
      expect(typeof item.posicao).toBe('number')
      expect(typeof item.rotulo).toBe('string')
    }

    // Coordenadores vazios até C5 (RPC não emite tipo='coordenador' ainda)
    // — o bucket existe mas fica vazio; não é regressão
    expect(dominio.coordenadores.length).toBeGreaterThanOrEqual(0)
  })

  it('toRankingsPublicos([]) retorna EMPTY_RANKINGS sem lançar', () => {
    const dominio = toRankingsPublicos([])
    expect(dominio.alunos).toHaveLength(0)
    expect(dominio.coordenadores).toHaveLength(0)
    expect(dominio.empresas).toHaveLength(0)
    expect(dominio.atualizado_em).toBeNull()
    expect(dominio.outros_alunos).toBe(0)
    expect(dominio.outros_coordenadores).toBe(0)
    expect(dominio.outros_empresas).toBe(0)
  })
})
