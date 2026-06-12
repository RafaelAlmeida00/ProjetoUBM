// @vitest-environment node
// T-B6 RED — 0042 erasure: token + email_contato zerados (A-MENOR-01 DURO → SR-B14)
// Rastreab.: CA35 (PII de contato) · RN7 (LGPD) · SR-B11, SR-B14 · STRIDE D-B01
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const USR = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'
const OUT = '00000000-0000-0000-0000-0000000000dd'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${USR}', 'user@gmail.com'),
      ('${ADM}', 'adm@empresa.com'),
      ('${OUT}', 'outro@corp.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Corp SA', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

/** Cria órfã com token e faz claim. Retorna dorId. */
async function criarClaim(
  db: import('@electric-sql/pglite').PGlite,
  email = 'user@corp.com',
): Promise<string> {
  const eid = await empId(db)
  await comoAnon(db)
  const rows = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
    `select * from public.submeter_dor_landing(
       $1, 'dor erasure test', 'Rep', 'TI', 'Dev', true, 'v1', now(), null, $2, null
     )`,
    [eid, email]
  )).rows
  const { out_dor_id: dorId, out_claim_token: token } = rows[0]!
  await comoUsuario(db, { uid: USR, email })
  await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])
  return dorId
}

describe('[DURO] 0042 erasure — claim_token_hash + email_corporativo zerados (SR-B14)', () => {
  it('erasure_titular zera claim_token_hash e claim_email na dor', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarClaim(db, 'user@corp.com')

    // Admin executa erasure
    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    await db.query(`select public.erasure_titular($1)`, [USR])

    await comoServiceRole(db)
    const dor = (await db.query<{ hash: Buffer | null; email: string | null }>(
      `select claim_token_hash as hash, claim_email as email from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.hash, 'claim_token_hash deve ser null após erasure').toBeNull()
    expect(dor.email, 'claim_email deve ser null após erasure').toBeNull()
    await db.close()
  })

  it('erasure_titular zera email_corporativo no membro_empresa', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await criarClaim(db, 'user@corp.com')

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    await db.query(`select public.erasure_titular($1)`, [USR])

    await comoServiceRole(db)
    const membro = (await db.query<{ email_corporativo: string | null }>(
      `select email_corporativo from public.membro_empresa where user_id = $1`, [USR],
    )).rows[0]!
    expect(membro.email_corporativo, 'email_corporativo zerado após erasure').toBeNull()
    await db.close()
  })

  it('erasure_titular zera claim_token_expires_at', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarClaim(db, 'user@corp.com')

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    await db.query(`select public.erasure_titular($1)`, [USR])

    await comoServiceRole(db)
    const dor = (await db.query<{ ttl: string | null }>(
      `select claim_token_expires_at as ttl from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.ttl, 'claim_token_expires_at deve ser null após erasure').toBeNull()
    await db.close()
  })

  it('[LGPD-F.4] erasure_titular scruba claim_email e email_corporativo do log de auditoria', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // criarClaim: submete + reclama → gera entradas no audit (dor UPDATE com claim_email)
    await criarClaim(db, 'user@corp.com')

    // Admin executa erasure (scrub do log na 0042:431-436 remove claim_email/email_corporativo)
    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    await db.query(`select public.erasure_titular($1)`, [USR])

    // Lê o log via ler_audit (admin-only, limit máximo)
    // ler_audit retorna: {id, op, tabela, ator, datahora, old, new, actor_role, record_id}
    const logRows = (await db.query<{ new: Record<string, unknown> | null; old: Record<string, unknown> | null }>(
      `select new, old from public.ler_audit(200)`,
    )).rows

    // Verifica que NENHUMA entrada do log expõe claim_email ou email_corporativo
    for (const row of logRows) {
      if (row.new !== null) {
        expect(Object.keys(row.new), '[LGPD] new no log não deve conter claim_email').not.toContain('claim_email')
        expect(Object.keys(row.new), '[LGPD] new no log não deve conter email_corporativo').not.toContain('email_corporativo')
      }
      if (row.old !== null) {
        expect(Object.keys(row.old), '[LGPD] old no log não deve conter claim_email').not.toContain('claim_email')
        expect(Object.keys(row.old), '[LGPD] old no log não deve conter email_corporativo').not.toContain('email_corporativo')
      }
    }
    await db.close()
  })
})
