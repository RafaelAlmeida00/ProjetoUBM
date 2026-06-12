// @vitest-environment node
// T-AN3 RED — 0040 tetos de payload na RPC: tamanho máximo dentro de submeter_dor_landing
// Rastreab.: SR-A7 · STRIDE D-A03
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, negado } from './_pglite/harness'

const REP = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}', 'rep@empresa.com'),
      ('${ADM}', 'adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by)
      values ('Acme Corp', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

const STR_5001 = 'a'.repeat(5001)
const STR_5000 = 'a'.repeat(5000)
const STR_201  = 'a'.repeat(201)
const STR_200  = 'a'.repeat(200)

describe('0040 tetos de payload — ramo anônimo', () => {
  it('descrição 5001 chars → negada (SR-A7)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
         )`,
        [eid, STR_5001, 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
      )
    )
    expect(err, 'descrição 5001 chars deve ser negada').toBe(true)
    await db.close()
  })

  it('descrição 5000 chars → aceita (limite exato)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const rows = (await db.query<{ out_dor_id: string }>(
      `select * from public.submeter_dor_landing(
         $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
       )`,
      [eid, STR_5000, 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
    )).rows
    expect(rows[0]!.out_dor_id).toBeTruthy()
    await db.close()
  })

  it('rep_nome 201 chars → negado (SR-A7)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
         )`,
        [eid, 'dor ok', STR_201, 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
      )
    )
    expect(err, 'rep_nome 201 deve ser negado').toBe(true)
    await db.close()
  })

  it('departamento 201 chars → negado (SR-A7)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
         )`,
        [eid, 'dor ok', 'Rep', STR_201, 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
      )
    )
    expect(err, 'departamento 201 deve ser negado').toBe(true)
    await db.close()
  })

  it('cargo 201 chars → negado (SR-A7)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
         )`,
        [eid, 'dor ok', 'Rep', 'TI', STR_201, true, 'v1', new Date().toISOString(), 'anon@corp.com']
      )
    )
    expect(err, 'cargo 201 deve ser negado').toBe(true)
    await db.close()
  })
})

describe('0040 tetos de payload — ramo logado (mesmos tetos)', () => {
  it('descrição 5001 chars → negada para logado (SR-A7)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(
        `select public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8, null, null, null
         )`,
        [eid, STR_5001, 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString()]
      )
    )
    expect(err, 'logado: descrição 5001 chars deve ser negada').toBe(true)
    await db.close()
  })

  it('rep_nome 200 chars → aceito para logado (limite exato)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const rows = (await db.query<{ out_dor_id: string }>(
      `select * from public.submeter_dor_landing(
         $1, $2, $3, $4, $5, $6, $7, $8, null, null, null
       )`,
      [eid, 'dor ok', STR_200, 'TI', 'Dev', true, 'v1', new Date().toISOString()]
    )).rows
    expect(rows[0]!.out_dor_id).toBeTruthy()
    await db.close()
  })
})
