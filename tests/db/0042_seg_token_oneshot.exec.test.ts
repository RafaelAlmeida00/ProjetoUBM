// @vitest-environment node
// T-B9 [SEG-DURO] RED — One-shot: replay do mesmo token após claim = negado (SR-B6)
// Rastreab.: CA31 · RN25 · SR-B6 [DURO], SR-B9 · STRIDE E-B01 · VETO-B2 (cláusula iv)
// NUNCA enfraquecer este teste (protect-tests)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const UID_A = '00000000-0000-0000-0000-0000000000aa'
const UID_B = '00000000-0000-0000-0000-0000000000bb'
const ADM   = '00000000-0000-0000-0000-0000000000cc'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_A}', 'usera@gmail.com'),
      ('${UID_B}', 'userb@gmail.com'),
      ('${ADM}',   'adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Corp SA', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

async function criarOrfaComToken(
  db: import('@electric-sql/pglite').PGlite,
  email = 'anon@corp.com',
): Promise<{ dorId: string; token: string }> {
  const eid = await empId(db)
  await comoAnon(db)
  const rows = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
    `select * from public.submeter_dor_landing(
       $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
     )`,
    [eid, 'dor oneshot test', 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString(), email]
  )).rows
  return { dorId: rows[0]!.out_dor_id, token: rows[0]!.out_claim_token }
}

describe('[SEG-DURO] One-shot: claim_token_hash zerado após sucesso (SR-B6)', () => {
  it('claim bem-sucedido → claim_token_hash vira null (one-shot)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db)

    await comoUsuario(db, { uid: UID_A, email: 'usera@gmail.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    await comoServiceRole(db)
    const dor = (await db.query<{ claim_token_hash: Buffer | null }>(
      `select claim_token_hash from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.claim_token_hash, '[SEG-DURO] claim_token_hash deve ser null após claim').toBeNull()
    await db.close()
  })

  it('replay: 2º claim com o mesmo token por uid diferente → negado (hash já null)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db)

    // uid_A faz o primeiro claim com sucesso
    await comoUsuario(db, { uid: UID_A, email: 'usera@gmail.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    // uid_B tenta replay com o MESMO token — deve ser negado (hash=null)
    await comoUsuario(db, { uid: UID_B, email: 'userb@gmail.com' })
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2)`, [dorId, token]),
    )
    expect(err, '[SEG-DURO] replay por uid diferente deve ser negado').toBe(true)
    await db.close()
  })

  it('re-claim pelo MESMO uid após sucesso → idempotente (no-op, sem erro)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db)

    // Primeiro claim
    await comoUsuario(db, { uid: UID_A, email: 'usera@gmail.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    // Re-claim pelo mesmo uid — deve ser no-op (idempotência SR-B6 / SR-B9)
    // Não passa o token na 2ª vez; autor_id = uid já bate → early return
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    // Verificar que o vínculo permanece correto e não duplicou papel
    await comoServiceRole(db)
    const papeis = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id = $1 and role = 'representante'`,
      [UID_A],
    )).rows[0]!.n
    expect(papeis, 'idempotência: papel não duplicado').toBe(1)
    await db.close()
  })

  it('após replay negado, dor continua com autor_id original (autor não sobrescrito)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db)

    await comoUsuario(db, { uid: UID_A, email: 'usera@gmail.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    await comoUsuario(db, { uid: UID_B, email: 'userb@gmail.com' })
    await negado(db.query(`select public.reclamar_dor($1, $2)`, [dorId, token]))

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string }>(
      `select autor_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id, 'uid_A permanece como autor após replay negado').toBe(UID_A)
    await db.close()
  })
})
