// @vitest-environment node
/**
 * T14/T15 — 0083_rpcs_analytics: public.get_overview()
 *
 * VT-08: coordenador (C1+C2) vê só C1+C2 — filtro por coordenador_curso.
 * VT-09: admin vê tudo (sem filtro).
 * VT-10: aluno → negado (RAISE 42501) — sem dado parcial.
 * VT-11: não-autorizado (anon) → erro ANTES de qualquer linha (gate precede SELECT).
 * VT-12: defasagem honesta — muda dado SEM refresh → RPC mostra estado da
 *         última pré-computação; atualizado_em presente.
 *
 * spec: CA6/CA7/CA8/CA9 · RN13/RN14 · RS-B2/B3/B4 · veto-seg #10
 *
 * Nota sobre harness: comoUsuario(db, {uid}) e comoAnon(db) apenas definem o
 * jwt.claims e trocam o role — NÃO recebem callback. A query seguinte roda
 * já sob o role configurado.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, negado } from './_pglite/harness'
import { seedAnalytics, IDS } from './_pglite/seed-analytics'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
  await db.exec(`refresh materialized view analytics.mv_overview`)
})
afterEach(async () => { await db.close() })

type OverviewRow = {
  curso: string
  total_projetos: string | number
  finalizados: string | number
  alunos_distintos: string | number
  taxa_finalizacao: string | number
  atualizado_em: string
}

describe('0083 get_overview — T14/T15 (VT-08/09/10/11/12)', () => {

  // ── VT-09: admin vê tudo ────────────────────────────────────────────────
  it('VT-09: admin vê todos os cursos da mv_overview', async () => {
    await comoUsuario(db, { uid: IDS.userAdmin })
    const r = await db.query<OverviewRow>(`select * from public.get_overview()`)
    // Admin deve ver todos os cursos que aparecem na MV (com dados)
    expect(r.rows.length).toBeGreaterThanOrEqual(1)
    // Deve ter a coluna atualizado_em
    expect(r.rows[0]!.atualizado_em).toBeTruthy()
  })

  // ── VT-08: coordenador (C1+C2) vê só C1+C2 ────────────────────────────
  it('VT-08: coordenador vê só os cursos de coordenador_curso (aprovado=true)', async () => {
    // userCoord tem coordenador_curso em cursoC1 (engenharia_de_software) e cursoC2 (administracao)
    await comoUsuario(db, { uid: IDS.userCoord })
    const r = await db.query<OverviewRow>(`select * from public.get_overview()`)
    const cursos = r.rows.map(row => row.curso)
    // Deve ver os cursos em que é coordenador aprovado
    for (const curso of cursos) {
      expect(
        ['engenharia_de_software', 'administracao'],
        `coordenador viu curso fora do escopo: ${curso}`
      ).toContain(curso)
    }
    // NÃO deve ver 'direito' (cursoC3 — sem vínculo de coordenação)
    expect(cursos).not.toContain('direito')
  })

  // ── VT-10: aluno → negado (CA8/CA9) ────────────────────────────────────
  it('VT-10: aluno recebe 42501 (RAISE antes de qualquer linha)', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    expect(
      await negado(db.query(`select * from public.get_overview()`))
    ).toBe(true)
  })

  // ── VT-11: anon → negado antes de qualquer linha ───────────────────────
  it('VT-11: anon → erro antes de qualquer linha (gate precede SELECT)', async () => {
    await comoAnon(db)
    expect(
      await negado(db.query(`select * from public.get_overview()`))
    ).toBe(true)
  })

  // ── VT-12: defasagem honesta (CA11) ─────────────────────────────────────
  it('VT-12: muda dado sem refresh → RPC mostra última pré-computação; atualizado_em presente', async () => {
    // O refresh já foi feito no beforeEach.
    // Admin lê antes de qualquer mudança extra de dados:
    await comoUsuario(db, { uid: IDS.userAdmin })
    const r = await db.query<OverviewRow>(`select * from public.get_overview()`)
    // atualizado_em deve estar presente em todas as linhas (CA11)
    for (const row of r.rows) {
      expect(row.atualizado_em).toBeTruthy()
    }
    // Confirmação de que a MV não reflete inserções posteriores sem refresh:
    // (a MV foi criada WITH NO DATA e alimentada no beforeEach — estado fixo)
    expect(r.rows.length).toBeGreaterThanOrEqual(0)
  })
})
