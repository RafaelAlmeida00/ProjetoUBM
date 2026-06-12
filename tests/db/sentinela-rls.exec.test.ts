// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco } from './_pglite/harness'

// SENTINELA: toda tabela de negócio tem RLS enable+force (anti CVE-2025-48757 / RN6 / RS19).
// Invariante real de segurança: com enable+force, tabela SEM policy = acesso negado (deny-by-default).
// Por isso o gate é "enable+force em TODA tabela", não "tem policy" (tabela trancada é legítima e segura).
const SCHEMAS = ['public', 'audit', 'fila']

describe('SENTINELA RLS', () => {
  it('toda tabela em public/audit/fila tem RLS enable+force (roda em todas as ondas)', async () => {
    const db = await novoBanco()
    const rows = (
      await db.query<{ schema: string; tabela: string; en: boolean; fo: boolean }>(
        `select n.nspname as schema, c.relname as tabela, c.relrowsecurity as en, c.relforcerowsecurity as fo
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind = 'r' and n.nspname = any($1)`,
        [SCHEMAS],
      )
    ).rows
    const falhas = rows.filter((r) => !r.en || !r.fo).map((r) => `${r.schema}.${r.tabela}`)
    expect(falhas, `tabelas sem enable+force RLS: ${falhas.join(', ')}`).toEqual([])
    await db.close()
  })
})
