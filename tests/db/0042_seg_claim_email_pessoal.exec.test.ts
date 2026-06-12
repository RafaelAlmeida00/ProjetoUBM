// @vitest-environment node
// T-B10 [SEG-DURO] RED — Claim por token correto com e-mail PESSOAL vincula (CA31)
// O caso de uso que estava quebrado: login @gmail ≠ claim_email corporativo.
// Rastreab.: CA31, CA34 · RN25, RN9 · SR-B4 [DURO], SR-B9 · STRIDE E-B02 · ADR-004F (F.2)
// NUNCA enfraquecer este teste (protect-tests)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole } from './_pglite/harness'

const REP = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}', 'ana.pessoal@gmail.com'),
      ('${ADM}', 'adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Corp SA', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

describe('[SEG-DURO] Claim com token correto e e-mail PESSOAL (@gmail) vincula (CA31)', () => {
  it('jwt.email @gmail ≠ claim_email corporativo + token correto → vincula (prova de posse = token)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    // Submit anônimo com e-mail CORPORATIVO como contato
    await comoAnon(db)
    const rows = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
      `select * from public.submeter_dor_landing(
         $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
       )`,
      [eid, 'dor CA31 email pessoal', 'Rep Anon', 'TI', 'Analista', true, 'v1', new Date().toISOString(), 'ana@empresa.com.br']
    )).rows
    const { out_dor_id: dorId, out_claim_token: token } = rows[0]!

    // Confirm claim_email é corporativo
    await comoServiceRole(db)
    const orfa = (await db.query<{ claim_email: string }>(
      `select claim_email from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(orfa.claim_email, 'claim_email deve ser o corporativo do form').toBe('ana@empresa.com.br')

    // Claim com e-mail PESSOAL (@gmail) — DIFERENTE do claim_email corporativo
    // A igualdade de e-mail está MORTA; só o token prova posse (ADR-004F F.5)
    await comoUsuario(db, { uid: REP, email: 'ana.pessoal@gmail.com' })
    await db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, eid])

    await comoServiceRole(db)
    const dor = (await db.query<{
      autor_id: string;
      status_dor: string;
      claim_token_hash: Buffer | null;
    }>(
      `select autor_id, status_dor, claim_token_hash from public.dor where id = $1`, [dorId],
    )).rows[0]!

    expect(dor.autor_id, '[CA31] e-mail pessoal + token correto deve vincular autor_id').toBe(REP)
    expect(dor.status_dor, 'A1: dor permanece em_moderacao após claim').toBe('em_moderacao')
    expect(dor.claim_token_hash, 'one-shot: claim_token_hash zerado após claim').toBeNull()
    await db.close()
  })

  it('papel representante criado + email_corporativo gravado com valor do form (não do jwt)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const rows = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
      `select * from public.submeter_dor_landing(
         $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
       )`,
      [eid, 'dor identidade rep', 'Ana Rep', 'Eng', 'Gerente', true, 'v1', new Date().toISOString(), 'ana@empresa.com.br']
    )).rows
    const { out_dor_id: dorId, out_claim_token: token } = rows[0]!

    // Login com @gmail pessoal
    await comoUsuario(db, { uid: REP, email: 'ana.pessoal@gmail.com' })
    await db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, eid])

    await comoServiceRole(db)

    // Papel representante criado
    const papel = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id = $1 and role = 'representante'`,
      [REP],
    )).rows[0]!.n
    expect(papel, 'papel representante criado').toBe(1)

    // email_corporativo = claim_email do form (não o jwt.email pessoal)
    const membro = (await db.query<{ email_corporativo: string | null }>(
      `select email_corporativo from public.membro_empresa where user_id = $1`, [REP],
    )).rows[0]!
    expect(
      membro.email_corporativo,
      'email_corporativo deve ser o corporativo do form, NÃO o jwt.email pessoal',
    ).toBe('ana@empresa.com.br')
    expect(membro.email_corporativo, 'email_corporativo NÃO deve ser o gmail pessoal').not.toBe('ana.pessoal@gmail.com')
    await db.close()
  })
})
