// @vitest-environment node
// T-B8 [SEG-DURO] RED — Token expirado (TTL) = negado (SR-B7)
// Rastreab.: SR-B7 [DURO] · STRIDE I-B03 (residual) · VETO-B2
// NUNCA enfraquecer este teste (protect-tests)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const REP = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}', 'rep@gmail.com'),
      ('${ADM}', 'adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Acme Corp', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

/** Cria órfã com token, depois força expiração no passado via service role. */
async function criarOrfaExpirada(
  db: import('@electric-sql/pglite').PGlite,
): Promise<{ dorId: string; token: string }> {
  const eid = await empId(db)
  await comoAnon(db)
  const rows = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
    `select * from public.submeter_dor_landing(
       $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
     )`,
    [eid, 'dor expirada TTL', 'Rep Anon', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
  )).rows
  const { out_dor_id: dorId, out_claim_token: token } = rows[0]!

  // Forçar expiração no passado (1 hora atrás)
  await comoServiceRole(db)
  await db.query(
    `update public.dor set claim_token_expires_at = now() - interval '1 hour' where id = $1`,
    [dorId],
  )

  return { dorId, token }
}

describe('[SEG-DURO] Token expirado (TTL) = negado (SR-B7)', () => {
  it('token correto mas expirado → claim negado (raise neutro)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaExpirada(db)

    await comoUsuario(db, { uid: REP, email: 'rep@gmail.com' })
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2)`, [dorId, token]),
    )
    expect(err, '[SEG-DURO] token expirado deve ser negado').toBe(true)
    await db.close()
  })

  it('após rejeição por TTL, dor permanece órfã (autor_id still null)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaExpirada(db)

    await comoUsuario(db, { uid: REP, email: 'rep@gmail.com' })
    await negado(db.query(`select public.reclamar_dor($1, $2)`, [dorId, token]))

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string | null }>(
      `select autor_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id, '[SEG-DURO] dor deve permanecer órfã após token expirado').toBeNull()
    await db.close()
  })

  it('token válido (não expirado) → vincula normalmente (regressão positiva)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    // Cria órfã SEM forçar expiração
    await comoAnon(db)
    const rows = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
      `select * from public.submeter_dor_landing(
         $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
       )`,
      [eid, 'dor TTL válido', 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
    )).rows
    const { out_dor_id: dorId, out_claim_token: token } = rows[0]!

    await comoUsuario(db, { uid: REP, email: 'rep@gmail.com' })
    await db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, eid])

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string }>(
      `select autor_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id, 'token válido deve vincular').toBe(REP)
    await db.close()
  })
})
