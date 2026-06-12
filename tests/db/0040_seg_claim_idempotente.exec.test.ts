// @vitest-environment node
// T-AN9 [SEG-DURO] RED — Claim token one-shot: re-disparo com mesmo token falha (consumido)
// Rastreab.: CA27 · RN25 · SR-B4, SR-B5 [DURO] · STRIDE E-A02
// NUNCA enfraquecer este teste (protect-tests)
// Transformado da versão 0040 (e-mail idempotente) para 0042 (token one-shot SR-B4)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const REP = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'
const OUT = '00000000-0000-0000-0000-0000000000dd'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}', 'rep@empresa.com'),
      ('${ADM}', 'adm@empresa.com'),
      ('${OUT}', 'outro@corp.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by)
      values ('Acme Corp', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

async function criarOrfaComToken(db: import('@electric-sql/pglite').PGlite, email = 'rep@empresa.com'): Promise<{ dorId: string; token: string }> {
  const eid = await empId(db)
  await comoAnon(db)
  const r = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
    `select * from public.submeter_dor_landing(
       $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
     )`,
    [eid, 'dor orfã idempotente', 'Rep Anon', 'TI', 'Dev', true, 'v1', new Date().toISOString(), email]
  )).rows
  return { dorId: r[0]!.out_dor_id, token: r[0]!.out_claim_token }
}

describe('[SEG-DURO] Claim token one-shot — mesmo uid re-claim = no-op idempotente (SR-B6)', () => {
  it('1º claim com token → ok; 2º claim pelo mesmo uid → no-op (SR-B6 idempotente, não negado)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    // 1ª vez — deve funcionar
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])
    // 2ª vez pelo mesmo uid com token já consumido — SR-B6: mesmo uid = no-op silencioso (early return)
    // NÃO deve lançar — o autor_id já = uid, então retorna sem erro
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    // Confirma que não criou duplicata de papel
    await comoServiceRole(db)
    const papeis = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id = $1 and role = 'representante'`,
      [REP],
    )).rows[0]!
    expect(papeis.n, 'no-op: não deve duplicar papel de representante').toBe(1)
    await db.close()
  })

  it('após one-shot, hash da dor foi limpo (claim_token_hash is null)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    await comoServiceRole(db)
    const dor = (await db.query<{ hash: Buffer | null }>(
      `select claim_token_hash as hash from public.dor where id = $1`, [dorId]
    )).rows[0]!
    expect(dor.hash, 'claim_token_hash deve ser null após claim one-shot').toBeNull()
    await db.close()
  })
})

describe('[SEG-DURO] 1 dor → 1 claim — outro uid com token errado é recusado', () => {
  it('após claim por REP, OUT com token falso não consegue reclamar', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db, 'rep@empresa.com')

    // REP reclama primeiro
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    // OUT tenta com token falso
    await comoUsuario(db, { uid: OUT, email: 'outro@corp.com' })
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2)`, [dorId, '00000000000000000000000000000000'])
    )
    expect(err, 'OUT com token falso não deve conseguir reclamar').toBe(true)
    await db.close()
  })

  it('dor já reclamada mantém autor_id do primeiro claimante', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    // Tentativa de OUT (falha)
    await comoUsuario(db, { uid: OUT, email: 'outro@corp.com' })
    await negado(db.query(`select public.reclamar_dor($1, $2)`, [dorId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']))

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string }>(
      `select autor_id from public.dor where id = $1`, [dorId]
    )).rows[0]!
    expect(dor.autor_id, 'autor_id deve permanecer o primeiro claimante').toBe(REP)
    await db.close()
  })
})
