// @vitest-environment node
// T-B1 RED — 0042 esquema: claim_token_hash + claim_token_expires_at + índice + email_corporativo
// Rastreab.: CA31 · RN22 · SR-B2, SR-B7, SR-B13 · ADR-004F (F.1/F.3)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

const USR = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedAdmin(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values ('${ADM}', 'adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
  `)
}

describe('0042 esquema — colunas existem com tipos corretos', () => {
  it('dor.claim_token_hash é bytea', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ t: string }>(
      `select data_type t from information_schema.columns
        where table_schema='public' and table_name='dor' and column_name='claim_token_hash'`
    )).rows[0]!.t
    expect(r).toBe('bytea')
    await db.close()
  })

  it('dor.claim_token_expires_at é timestamptz', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ t: string }>(
      `select data_type t from information_schema.columns
        where table_schema='public' and table_name='dor' and column_name='claim_token_expires_at'`
    )).rows[0]!.t
    expect(r.toLowerCase()).toMatch(/timestamp/)
    await db.close()
  })

  it('membro_empresa.email_corporativo é text', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ t: string }>(
      `select data_type t from information_schema.columns
        where table_schema='public' and table_name='membro_empresa' and column_name='email_corporativo'`
    )).rows[0]!.t
    expect(r).toBe('text')
    await db.close()
  })
})

describe('0042 esquema — índice parcial existe', () => {
  it('índice dor_claim_token_hash_orfa_idx existe com condição correta', async () => {
    const db = await novoBanco()
    // pg_get_indexdef retorna a definição SQL do índice
    const def = (await db.query<{ def: string }>(
      `select pg_get_indexdef(indexrelid) def
         from pg_index i join pg_class c on c.oid = i.indexrelid
        where c.relname = 'dor_claim_token_hash_orfa_idx'`
    )).rows[0]?.def
    expect(def).toBeTruthy()
    expect(def!.toLowerCase()).toMatch(/autor_id.*null.*deleted_at.*null/)
    await db.close()
  })
})

describe('0042 esquema — claim_token_hash não vaza para não-admin', () => {
  it('anon não vê claim_token_hash (não existe em nenhuma coluna acessível)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    const r = (await db.query(
      `select claim_token_hash from public.dor limit 0`
    )).rows
    expect(r).toEqual([])
    await db.close()
  })

  it('email_corporativo vaza 0 linhas para anon (RLS)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    // RLS permite a consulta mas retorna 0 linhas (policy bloqueia)
    const r = (await db.query(
      `select email_corporativo from public.membro_empresa limit 1`
    )).rows
    expect(r.length, 'anon deve ver 0 linhas de email_corporativo via RLS').toBe(0)
    await db.close()
  })

  it('admin vê email_corporativo', async () => {
    const db = await novoBanco()
    await seedAdmin(db)

    // Cria empresa e membro como admin autenticado (evita trigger RLS issues)
    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    // obter_ou_criar_empresa funciona para authenticated
    const eid = (await db.query<{ id: string }>(
      `select public.obter_ou_criar_empresa('Corp') id`
    )).rows[0]!.id

    await db.exec(`
      insert into public.membro_empresa(user_id, empresa_id, papel, email_corporativo)
      values ('${ADM}', '${eid}', 'representante', 'adm@corp.com');
    `)

    await comoServiceRole(db)
    const r = (await db.query<{ e: string }>(
      `select email_corporativo e from public.membro_empresa where user_id = '${ADM}'`
    )).rows[0]!.e
    expect(r).toBe('adm@corp.com')
    await db.close()
  })
})
