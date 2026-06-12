// @vitest-environment node
// T-AN5 RED — 0040 claim: RPC reclamar_dor(p_dor_id, p_token, p_empresa_id) DEFINER authenticated
// Rastreab.: CA22, CA27 · RN25, RN9 · SR-A8, SR-A12, SR-A-H1, SR-A-H3 · STRIDE S-A01/E-A02 · ADR-004E (E.4)
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
    [eid, 'dor orfã para claim', 'Rep Anon', 'TI', 'Dev', true, 'v1', new Date().toISOString(), email]
  )).rows
  return { dorId: r[0]!.out_dor_id, token: r[0]!.out_claim_token }
}

describe('0040 reclamar_dor — token correto vincula autor_id (CA22/CA31)', () => {
  it('token correto → vincula autor_id + dor permanece em_moderacao (A1)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string; status_dor: string }>(
      `select autor_id, status_dor from public.dor where id = $1`, [dorId]
    )).rows[0]!
    expect(dor.autor_id, 'autor_id deve ser o uid após claim').toBe(REP)
    expect(dor.status_dor, 'A1: dor permanece em_moderacao após claim (não publica)').toBe('em_moderacao')
    await db.close()
  })

  it('claim cria identidade: papel representante + membro_empresa', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    await comoServiceRole(db)
    const papel = (await db.query<{ role: string }>(
      `select role from public.papel_usuario where user_id = $1`, [REP]
    )).rows
    expect(papel.some(p => p.role === 'representante'), 'papel representante deve ser criado').toBe(true)

    const membro = (await db.query<{ empresa_id: string }>(
      `select empresa_id from public.membro_empresa where user_id = $1 and papel = 'representante'`, [REP]
    )).rows
    expect(membro.length, 'vínculo membro_empresa deve ser criado').toBeGreaterThan(0)
    await db.close()
  })
})

describe('0040 reclamar_dor — grants: anon NÃO executa reclamar_dor', () => {
  it('anon não consegue chamar reclamar_dor (negado)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db, 'rep@empresa.com')

    await comoAnon(db)
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])
    )
    expect(err, 'anon não deve conseguir reclamar_dor').toBe(true)
    await db.close()
  })

  it('has_function_privilege: anon NÃO tem execute em reclamar_dor', async () => {
    const db = await novoBanco()
    // Após 0042, assinatura é reclamar_dor(uuid, text, uuid) — p_empresa_id default null.
    // Invariante de segurança preservado: anon não executa reclamar_dor em nenhuma assinatura.
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.reclamar_dor(uuid, text, uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em reclamar_dor').toBe(false)
    await db.close()
  })
})
