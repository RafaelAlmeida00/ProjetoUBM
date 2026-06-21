// @vitest-environment node
/**
 * T1.1 — 0064_enums_assinatura
 *
 * RED: os tipos não existem (migração ainda não aplicada ao banco criado até 0063).
 * GREEN: após 0064, os enums existem e contêm os valores esperados.
 *
 * spec: RN7b/RN8 · arch §4.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
})
afterEach(async () => {
  await db.close()
})

describe('0064 enums de assinatura', () => {
  it('status_assinatura existe com os 6 valores', async () => {
    const rows = (
      await db.query<{ enumlabel: string }>(
        `select enumlabel from pg_enum
         where enumtypid = 'public.status_assinatura'::regtype
         order by enumsortorder`,
      )
    ).rows.map((r) => r.enumlabel)
    expect(rows).toEqual(['pendente', 'enviada', 'assinada', 'recusada', 'expirada', 'cancelada'])
  })

  it('tipo_documento existe com os 3 valores', async () => {
    const rows = (
      await db.query<{ enumlabel: string }>(
        `select enumlabel from pg_enum
         where enumtypid = 'public.tipo_documento'::regtype
         order by enumsortorder`,
      )
    ).rows.map((r) => r.enumlabel)
    expect(rows).toEqual(['proposta', 'contraproposta', 'outro'])
  })

  it('origem_assinatura existe com os 2 valores', async () => {
    const rows = (
      await db.query<{ enumlabel: string }>(
        `select enumlabel from pg_enum
         where enumtypid = 'public.origem_assinatura'::regtype
         order by enumsortorder`,
      )
    ).rows.map((r) => r.enumlabel)
    expect(rows).toEqual(['autentique', 'upload_livre'])
  })

  it('colunas do enum são usáveis em cast direto', async () => {
    // garante que os tipos podem ser usados em expressões SQL normais
    const r = await db.query<{ v: string }>(
      `select 'pendente'::public.status_assinatura::text as v`,
    )
    expect(r.rows[0]!.v).toBe('pendente')

    const r2 = await db.query<{ v: string }>(
      `select 'autentique'::public.origem_assinatura::text as v`,
    )
    expect(r2.rows[0]!.v).toBe('autentique')

    const r3 = await db.query<{ v: string }>(
      `select 'proposta'::public.tipo_documento::text as v`,
    )
    expect(r3.rows[0]!.v).toBe('proposta')
  })
})
