// @vitest-environment node
/**
 * T09 — BARREIRA DURA CA18: zero PII no dado público (mv_rankings_publico)
 *
 * VT-17: inspeção de colunas de mv_rankings_publico via pg_attribute:
 *        só {nome_publico, rótulo, métrica, contagem, atualizado_em};
 *        NENHUMA email/telefone/doc/IP/user_id/pessoa_id/autor_id.
 *
 * spec: CA18 (DURO) · RN12 · RS-P4 · I3 · veto-seg #3
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco } from './_pglite/harness'
import { seedAnalytics } from './_pglite/seed-analytics'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
})
afterEach(async () => { await db.close() })

// PII absolutamente proibida (RS-P4/CA18)
const PII_PROIBIDA = [
  'email',
  'telefone',
  'documento',
  'ip',
  'user_id',
  'pessoa_id',
  'autor_id',
  'raw_user_meta_data',
  'avatar_url',
  'responsavel_id',
  'host_coordenador_id',
  'created_by',
  'deleted_by',
]

// Colunas permitidas na superfície pública
const COLUNAS_ESPERADAS = [
  'nome_publico',     // nominal sob opt-in + k-anon
  'rotulo_papel',     // rótulo unidimensional (papel_projeto)
  'rotulo_curso',     // rótulo unidimensional (curso)
  'projetos_finalizados', // métrica
  'contagem',         // tamanho do grupo (k-anon)
  'atualizado_em',    // carimbo de frescor (AD-008-1)
]

describe('0081 barreira CA18 — mv_rankings_publico zero PII (T09/VT-17)', () => {

  it('VT-17: mv_rankings_publico NÃO projeta PII', async () => {
    // MVs não estão em information_schema.columns → usar pg_attribute
    const r = await db.query<{ attname: string }>(
      `select a.attname
       from pg_catalog.pg_attribute a
       join pg_catalog.pg_class     c on c.oid = a.attrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'analytics'
         and c.relname = 'mv_rankings_publico'
         and a.attnum  > 0
         and not a.attisdropped`
    )
    const colunas = r.rows.map(row => row.attname.toLowerCase())

    for (const pii of PII_PROIBIDA) {
      expect(
        colunas,
        `coluna PII "${pii}" encontrada em mv_rankings_publico (veto #3 / CA18)`
      ).not.toContain(pii)
    }
  })

  it('VT-17: mv_rankings_publico contém as colunas esperadas (seguras)', async () => {
    const r = await db.query<{ attname: string }>(
      `select a.attname
       from pg_catalog.pg_attribute a
       join pg_catalog.pg_class     c on c.oid = a.attrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'analytics'
         and c.relname = 'mv_rankings_publico'
         and a.attnum  > 0
         and not a.attisdropped`
    )
    const colunas = r.rows.map(row => row.attname)

    for (const esperada of COLUNAS_ESPERADAS) {
      expect(colunas, `coluna esperada "${esperada}" ausente em mv_rankings_publico`).toContain(esperada)
    }
  })

  it('VT-17: definição da MV não referencia colunas PII na projeção SELECT final', async () => {
    const r = await db.query<{ def: string }>(
      `select pg_get_viewdef('analytics.mv_rankings_publico'::regclass) as def`
    )
    const def = r.rows[0]!.def.toLowerCase()

    // A projeção final do SELECT não deve expor PII diretamente
    // (user_id pode aparecer em JOINs internos, mas não no SELECT final)
    // Verificamos que 'email' e 'telefone' não aparecem em lugar nenhum
    expect(def).not.toMatch(/\bemail\b/)
    expect(def).not.toMatch(/\btelefone\b/)
    expect(def).not.toMatch(/\braw_user_meta_data\b/)
  })
})
