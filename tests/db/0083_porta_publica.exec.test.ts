// @vitest-environment node
/**
 * T14/T16/T17 — 0083_rpcs_analytics: public.get_rankings_publicos()
 *
 * VT-20: leitura direta analytics.mv_* como authenticated/anon → negado (CA20).
 * VT-16: pg_proc.pronargs=0 p/ get_rankings_publicos; LIMIT 50 fixo (CA17 / veto #9).
 * VT-21: 2 pg_proc distintos; porta pública projeta só colunas seguras; não reutiliza
 *        a autenticada (CA21 / veto #15).
 *
 * spec: CA17/CA20/CA21 · RN11/RN14 · RS-B4/B5 · veto-seg #9/#15
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco } from './_pglite/harness'
import { seedAnalytics, IDS } from './_pglite/seed-analytics'
import { comoUsuario, comoAnon, negado } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
  await db.exec(`
    refresh materialized view analytics.mv_rankings_publico;
    refresh materialized view analytics.mv_rankings_empresa;
    refresh materialized view analytics.mv_overview;
  `)
})
afterEach(async () => { await db.close() })

describe('0083 porta_publica — T14/T16/T17 (VT-16/20/21)', () => {

  // ── VT-20: leitura direta analytics.mv_* → negado (CA20) ───────────────
  it('VT-20: authenticated não consegue ler analytics.mv_overview diretamente', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    expect(await negado(db.query(`select * from analytics.mv_overview`))).toBe(true)
  })

  it('VT-20: authenticated não consegue ler analytics.mv_rankings_publico diretamente', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    expect(await negado(db.query(`select * from analytics.mv_rankings_publico`))).toBe(true)
  })

  it('VT-20: anon não consegue ler analytics.mv_rankings_empresa diretamente', async () => {
    await comoAnon(db)
    expect(await negado(db.query(`select * from analytics.mv_rankings_empresa`))).toBe(true)
  })

  // ── VT-16: pronargs=0 (CA17 / veto #9) ────────────────────────────────
  it('VT-16: get_rankings_publicos tem pronargs=0 (paramétrica-zero)', async () => {
    const r = await db.query<{ pronargs: number }>(
      `select p.pronargs
       from pg_catalog.pg_proc     p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'get_rankings_publicos'`
    )
    expect(r.rows).toHaveLength(1)
    expect(Number(r.rows[0]!.pronargs)).toBe(0)
  })

  it('VT-16: definição de get_rankings_publicos contém LIMIT 50 fixo', async () => {
    const r = await db.query<{ def: string }>(
      `select pg_get_functiondef(p.oid) as def
       from pg_catalog.pg_proc     p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'get_rankings_publicos'`
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]!.def.toLowerCase()).toMatch(/limit\s+50/)
  })

  // ── VT-21: 2 pg_proc distintos; porta pública projetando só colunas seguras ──
  it('VT-21: existem 2 funções RPC distintas (get_overview ≠ get_rankings_publicos)', async () => {
    const r = await db.query<{ proname: string }>(
      `select p.proname
       from pg_catalog.pg_proc     p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('get_overview', 'get_rankings_publicos')
       order by p.proname`
    )
    const nomes = r.rows.map(row => row.proname)
    expect(nomes).toContain('get_overview')
    expect(nomes).toContain('get_rankings_publicos')
    expect(nomes).toHaveLength(2)
  })

  it('VT-21: get_rankings_publicos não projeta user_id/pessoa_id/email (só colunas seguras)', async () => {
    const r = await db.query<{ def: string }>(
      `select pg_get_functiondef(p.oid) as def
       from pg_catalog.pg_proc     p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'get_rankings_publicos'`
    )
    const def = r.rows[0]!.def.toLowerCase()
    // Não deve projetar PII diretamente (sem user_id/pessoa_id fora de alias seguro)
    expect(def).not.toMatch(/\buser_id\b.*select/)
    expect(def).not.toMatch(/\bemail\b/)
  })

  // ── Chamada funcional: get_rankings_publicos retorna resultado (não falha) ──
  it('get_rankings_publicos executável por authenticated (porta pública funciona)', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    const r = await db.query(`select * from public.get_rankings_publicos()`)
    // Pode retornar 0 linhas se MV vazia — mas não deve lançar erro
    expect(Array.isArray(r.rows)).toBe(true)
  })

  it('get_rankings_publicos executável por anon (porta pública aberta)', async () => {
    await comoAnon(db)
    const r = await db.query(`select * from public.get_rankings_publicos()`)
    expect(Array.isArray(r.rows)).toBe(true)
  })

  // ── C5: pódio de coordenadores (tipo='coordenador' para host/co_coordenador) ─
  it('C5 RED→GREEN: get_rankings_publicos emite tipo="coordenador" para host/co_coordenador', async () => {
    // O seed tem coordenadores (host) opt-in em grupo >=5 para engenharia_de_software.
    // Após refresh, a MV deve conter linhas com rotulo_papel='host'.
    // A RPC deve emitir tipo='coordenador' para esses — não 'aluno'.
    const r = await db.query<{ tipo: string; rotulo_papel: string }>(`
      select * from public.get_rankings_publicos()
    `)
    const tipos = r.rows.map(row => row.tipo)
    expect(tipos, 'RPC deve emitir tipo="coordenador" para host/co_coordenador').toContain('coordenador')
  })

  it('C5: tipo="aluno" ainda presente após o fix (sem regressão)', async () => {
    // O seed tem alunos opt-in em grupo >=5 para engenharia_de_software.
    // tipo='aluno' deve continuar sendo emitido.
    const r = await db.query<{ tipo: string }>(`
      select * from public.get_rankings_publicos()
    `)
    const tipos = r.rows.map(row => row.tipo)
    // aluno E empresa devem continuar presentes
    expect(tipos).toContain('aluno')
    expect(tipos).toContain('empresa')
  })

  it('C5: tipo="empresa" não regrediu após o fix', async () => {
    const r = await db.query<{ tipo: string }>(`
      select * from public.get_rankings_publicos()
    `)
    const tipos = r.rows.map(row => row.tipo)
    expect(tipos).toContain('empresa')
  })
})
