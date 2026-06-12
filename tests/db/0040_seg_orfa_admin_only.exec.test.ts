// @vitest-environment node
// T-AN7 [SEG-DURO] RED — Dor órfã legível SÓ por admin (0 linhas para anon e authenticated≠admin)
// Rastreab.: CA22 · RN17 · SR-A6 [DURO], I-A01, I-A02 · VETO-AN (invariante 1)
// NUNCA enfraquecer este teste (protect-tests)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole } from './_pglite/harness'

const REP = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'
const OUT = '00000000-0000-0000-0000-0000000000dd'  // outro authenticated, não é admin

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}', 'rep@empresa.com'),
      ('${ADM}', 'adm@empresa.com'),
      ('${OUT}', 'outro@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by)
      values ('Acme Corp', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

async function criarOrfa(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  const eid = await empId(db)
  await comoAnon(db)
  const r = (await db.query<{ out_dor_id: string }>(
    `select * from public.submeter_dor_landing(
       $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
     )`,
    [eid, 'dor orfã segura', 'Rep Anon', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'rep@empresa.com']
  )).rows
  return r[0]!.out_dor_id
}

describe('[SEG-DURO] Dor órfã admin-only — anon recebe 0 linhas', () => {
  it('anon SELECT na dor → 0 linhas (dor órfã invisível a anon)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarOrfa(db)

    await comoAnon(db)
    const rows = (await db.query<{ id: string }>(
      `select id from public.dor where id = $1`, [dorId]
    )).rows
    expect(rows.length, '[SEG-DURO] anon não deve ver dor órfã').toBe(0)
    await db.close()
  })
})

describe('[SEG-DURO] Dor órfã admin-only — authenticated não-admin recebe 0 linhas', () => {
  it('authenticated (OUT, não é admin, email diferente) → 0 linhas', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarOrfa(db)

    await comoUsuario(db, { uid: OUT, email: 'outro@empresa.com' })
    const rows = (await db.query<{ id: string }>(
      `select id from public.dor where id = $1`, [dorId]
    )).rows
    expect(rows.length, '[SEG-DURO] authenticated não-admin não deve ver dor órfã').toBe(0)
    await db.close()
  })

  it('authenticated (REP, email igual ao claim_email mas ainda sem claim) → 0 linhas', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarOrfa(db)

    // REP tem o mesmo e-mail do claim mas NÃO fez o claim ainda → não deve ver
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const rows = (await db.query<{ id: string }>(
      `select id from public.dor where id = $1`, [dorId]
    )).rows
    expect(rows.length, '[SEG-DURO] autenticado com email igual mas sem claim não vê').toBe(0)
    await db.close()
  })
})

describe('[SEG-DURO] Dor órfã admin-only — admin vê na fila', () => {
  it('admin → vê a dor órfã (1 linha)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarOrfa(db)

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    const rows = (await db.query<{ id: string }>(
      `select id from public.dor where id = $1`, [dorId]
    )).rows
    expect(rows.length, 'admin deve ver a dor órfã').toBe(1)
    await db.close()
  })

  it('service_role → vê a dor órfã (1 linha, sem RLS)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarOrfa(db)

    await comoServiceRole(db)
    const rows = (await db.query<{ id: string }>(
      `select id from public.dor where id = $1`, [dorId]
    )).rows
    expect(rows.length, 'service_role deve ver a dor órfã').toBe(1)
    await db.close()
  })
})
