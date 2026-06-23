// @vitest-environment node
/**
 * T04 — BARREIRA DURA CA5a: painel empresa = só contagens, zero coluna de pessoa
 *
 * VT-06: inspeção information_schema.columns de vw_painel_empresa → só agregados;
 *        falha se aparecer nome_publico/pessoa_id/user_id/email/rep_nome.
 * VT-05: par X≠Y — rep de X NÃO vê números de Y (recorte membro_empresa).
 *
 * spec: CA5a (DURO) · RN2b · RS-A3 · I5 · veto-seg #7
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario } from './_pglite/harness'
import { seedAnalytics, IDS } from './_pglite/seed-analytics'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
})
afterEach(async () => { await db.close() })

// Colunas de pessoa proibidas na superfície analítica da Família 2 (RS-A3/CA5a)
const COLUNAS_PROIBIDAS = [
  'nome_publico',
  'pessoa_id',
  'user_id',
  'email',
  'rep_nome',
  'autor_id',
  'responsavel_id',
  'host_coordenador_id',
]

describe('0079 barreira CA5a — vw_painel_empresa só contagens (T04)', () => {

  // ── VT-06: inspeção estrutural de colunas ─────────────────────────────────
  it('VT-06: vw_painel_empresa NÃO projeta colunas de pessoa', async () => {
    const r = await db.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'vw_painel_empresa'`
    )
    const colunas = r.rows.map(row => row.column_name.toLowerCase())

    for (const proibida of COLUNAS_PROIBIDAS) {
      expect(
        colunas,
        `coluna proibida "${proibida}" encontrada em vw_painel_empresa (veto #7 / CA5a)`
      ).not.toContain(proibida)
    }
  })

  it('VT-06: vw_painel_empresa contém coluna empresa_id e contagens', async () => {
    const r = await db.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'vw_painel_empresa'`
    )
    const colunas = r.rows.map(row => row.column_name)
    // Deve ter empresa_id como âncora + pelo menos uma coluna de contagem
    expect(colunas).toContain('empresa_id')
    const temContagem = colunas.some(c =>
      c.includes('dores') || c.includes('projetos') || c.includes('count')
    )
    expect(temContagem, 'deve ter pelo menos uma coluna de contagem').toBe(true)
  })

  // ── VT-05: par X≠Y — rep de X não vê números de Y ────────────────────────
  it('VT-05: rep de X vê empresa X mas NÃO empresa Y', async () => {
    await comoUsuario(db, { uid: IDS.userRep })
    const r = await db.query<{ empresa_id: string }>(
      `select empresa_id from public.vw_painel_empresa`
    )
    const ids = r.rows.map(row => row.empresa_id)

    expect(ids).toContain(IDS.empresaX)
    expect(ids).not.toContain(IDS.empresaY)
  })

  it('VT-05: rep de Y vê empresa Y mas NÃO empresa X', async () => {
    await comoUsuario(db, { uid: IDS.userRepY })
    const r = await db.query<{ empresa_id: string }>(
      `select empresa_id from public.vw_painel_empresa`
    )
    const ids = r.rows.map(row => row.empresa_id)

    expect(ids).toContain(IDS.empresaY)
    expect(ids).not.toContain(IDS.empresaX)
  })
})
