// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco } from './_pglite/harness'

// Onda 1 / T-O1.5 — migração 0019 (Storage bucket + policies).
// ATENÇÃO: schema 'storage' NÃO existe no PGlite — a migração deve ser NO-OP neste ambiente.
// O comportamento real de Storage é smoke do Maestro (Onda 4).
// Este teste só verifica que a migração aplica sem erro e não polui o schema public.
// CA16 (Storage real): validado no smoke da Onda 4.
// security.md §3: bucket privado + privado-até-publicar + allowlist (implementado no Supabase real).

describe('0019 Storage policies (migração no-op no PGlite)', () => {
  it('migração 0019 aplica sem erro no PGlite (guard storage schema)', async () => {
    const db = await novoBanco()
    // Se chegou aqui sem exceção, a migração executou com sucesso (guard funcionou)
    // Verifica que o schema storage NÃO foi criado (sem efeito colateral no PGlite)
    const schemas = (await db.query<{ schema_name: string }>(
      `select schema_name from information_schema.schemata where schema_name='storage'`
    )).rows
    expect(schemas.length).toBe(0) // storage não existe no PGlite — guard funcionou
    await db.close()
  })

  it('tabelas public.dor, public.anexo_dor intactas após a 0019 (sem regressão)', async () => {
    const db = await novoBanco()
    const dorExiste = (await db.query<{ n: number }>(
      `select count(*)::int n from information_schema.tables
       where table_schema='public' and table_name='dor'`
    )).rows[0]!.n
    expect(dorExiste).toBe(1)
    const anexoExiste = (await db.query<{ n: number }>(
      `select count(*)::int n from information_schema.tables
       where table_schema='public' and table_name='anexo_dor'`
    )).rows[0]!.n
    expect(anexoExiste).toBe(1)
    await db.close()
  })
})
