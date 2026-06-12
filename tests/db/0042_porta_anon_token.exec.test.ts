// @vitest-environment node
// T-B2 RED — 0042 porta anon v3: submeter_dor_landing returns table(dor_id, claim_token)
// Rastreab.: CA21, CA23 · RN16 · SR-B1, SR-B2, SR-B3, SR-B7 · ADR-004F (F.2)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const REP = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}', 'rep@empresa.com'),
      ('${ADM}', 'adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Acme Corp', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

describe('0042 porta anon v3 — anon recebe claim_token', () => {
  it('anon chama submeter_dor_landing v3 → retorna {dor_id, claim_token} não-nulo', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const rows = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
      `select * from public.submeter_dor_landing(
         $1, $2, $3, $4, $5, $6, $7, $8, null,
         $9, null
       )`,
      [eid, 'dor anon token test', 'Rep Anon', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
    )).rows
    expect(rows.length).toBe(1)
    expect(rows[0]!.out_dor_id).toBeTruthy()
    expect(rows[0]!.out_claim_token, 'anon deve receber claim_token não-nulo').toBeTruthy()
    expect(rows[0]!.out_claim_token.length, 'token deve ter ≥ 32 hex chars').toBeGreaterThanOrEqual(32)

    // Verifica que o hash foi gravado (e é DIFERENTE do token em claro)
    await comoServiceRole(db)
    const dor = (await db.query<{ hash: Buffer | null; ttl: string | null }>(
      `select claim_token_hash as hash, claim_token_expires_at as ttl
         from public.dor where id = $1`,
      [rows[0]!.out_dor_id]
    )).rows[0]!
    expect(dor.hash, 'claim_token_hash deve estar setado').toBeTruthy()
    // Converte hash para hex e compara com o token — devem ser diferentes (SR-B2)
    const hashHex = Buffer.from(dor.hash!).toString('hex')
    expect(hashHex, 'hash não deve ser igual ao token em claro').not.toBe(rows[0]!.out_claim_token)
    // TTL ≈ now + 24h
    expect(dor.ttl, 'claim_token_expires_at deve estar setado').toBeTruthy()
    await db.close()
  })

  it('claim_email normalizado (lowercase) ainda gravado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const rows = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
      `select * from public.submeter_dor_landing(
         $1, $2, $3, $4, $5, $6, $7, $8, null,
         $9, null
       )`,
      [eid, 'dor anon email check', 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'ANON@Corp.Com']
    )).rows

    await comoServiceRole(db)
    const dor = (await db.query<{ claim_email: string }>(
      `select claim_email from public.dor where id = $1`,
      [rows[0]!.out_dor_id]
    )).rows[0]!
    expect(dor.claim_email, 'claim_email deve estar normalizado lowercase').toBe('anon@corp.com')
    await db.close()
  })

  it('logado → claim_token é null (sem token no caminho logado, F.5)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const rows = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
      `select * from public.submeter_dor_landing(
         $1, $2, $3, $4, $5, $6, $7, $8, null,
         null, null
       )`,
      [eid, 'dor logado via v3', 'Rep', 'Eng', 'Gerente', true, 'v1', new Date().toISOString()]
    )).rows
    expect(rows.length).toBe(1)
    expect(rows[0]!.out_dor_id).toBeTruthy()
    expect(rows[0]!.out_claim_token, 'logado: claim_token deve ser null').toBeNull()
    await db.close()
  })
})

describe('0042 porta anon v3 — regressão: gates preservados', () => {
  it('anon com e-mail genérico → negado (SR-A8)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select * from public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8, null,
           $9, null
         )`,
        [eid, 'dor anon gmail', 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'joao@gmail.com']
      )
    )
    expect(err, 'e-mail genérico deve ser negado').toBe(true)
    await db.close()
  })

  it('anon sem consentimento → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select * from public.submeter_dor_landing(
           $1, $2, $3, $4, $5, false, null, null, null,
           $6, null
         )`,
        [eid, 'dor sem consent', 'Rep', 'TI', 'Dev', 'anon@corp.com']
      )
    )
    expect(err, 'sem consentimento deve ser negado').toBe(true)
    await db.close()
  })

  it('anon com descrição vazia → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select * from public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8, null,
           $9, null
         )`,
        [eid, '   ', 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
      )
    )
    expect(err, 'descrição vazia deve ser negada').toBe(true)
    await db.close()
  })
})
