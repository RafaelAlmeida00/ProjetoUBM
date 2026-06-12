// @vitest-environment node
// T-B4 RED — 0042 reclamar_dor v3: (p_dor_id, p_token, p_empresa_id default null)
// Prova por token one-shot + empresa diferida + onboarding v2 com email_contato
// Rastreab.: CA31, CA34 · RN25, RN9 · SR-B4, SR-B5, SR-B6, SR-B7, SR-B9, SR-B12, SR-A-H3 · ADR-004F (F.5)
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

/** Cria órfã via submeter_dor_landing v3 e retorna {dorId, token}. */
async function criarOrfaComToken(
  db: import('@electric-sql/pglite').PGlite,
  email = 'rep@corp.com',
  empresaId?: string,
  empresaNome?: string,
): Promise<{ dorId: string; token: string }> {
  await comoAnon(db)
  const rows = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
    `select * from public.submeter_dor_landing(
       $1, $2, $3, $4, $5, $6, $7, $8, null,
       $9, $10
     )`,
    [empresaId ?? null, 'dor orfã token claim', 'Rep Anon', 'TI', 'Dev',
     true, 'v1', new Date().toISOString(), email, empresaNome ?? null]
  )).rows
  return { dorId: rows[0]!.out_dor_id, token: rows[0]!.out_claim_token }
}

describe('0042 reclamar_dor v3 — token correto com email PESSOAL vincula (CA31)', () => {
  it('login @gmail + token correto → vincula autor_id + identidade rep + email_contato', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const { dorId, token } = await criarOrfaComToken(db, 'ana@corp.com', eid)

    // Login com email PESSOAL (@gmail) — diferente do claim_email corporativo
    await comoUsuario(db, { uid: REP, email: 'rep@gmail.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string; status_dor: string; claim_token_hash: string | null }>(
      `select autor_id, status_dor, claim_token_hash from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id, 'autor_id vinculado com email pessoal').toBe(REP)
    expect(dor.status_dor, 'A1: permanece em_moderacao').toBe('em_moderacao')
    expect(dor.claim_token_hash, 'one-shot: claim_token_hash deve ser null').toBeNull()

    // Identidade de representante criada
    const papel = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id = $1 and role = 'representante'`, [REP],
    )).rows[0]!.n
    expect(papel, 'papel representante criado').toBe(1)

    // email_corporativo deve vir do claim_email (contato)
    const membro = (await db.query<{ email_corporativo: string | null }>(
      `select email_corporativo from public.membro_empresa where user_id = $1`, [REP],
    )).rows[0]!
    expect(membro.email_corporativo, 'email_corporativo de contato gravado').toBe('ana@corp.com')
    await db.close()
  })
})

describe('0042 reclamar_dor v3 — empresa diferida (E.3/E.4)', () => {
  it('órfã sem empresa + p_empresa_id válido → vincula empresa + identidade', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const { dorId, token } = await criarOrfaComToken(db, 'ana@corp.com')

    // Confirma órfã sem empresa
    await comoServiceRole(db)
    const antes = (await db.query<{ empresa_id: string | null }>(
      `select empresa_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(antes.empresa_id).toBeNull()

    await comoUsuario(db, { uid: REP, email: 'rep@gmail.com' })
    await db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, eid])

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string; empresa_id: string }>(
      `select autor_id, empresa_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id).toBe(REP)
    expect(dor.empresa_id).toBe(eid)
    await db.close()
  })
})

describe('0042 reclamar_dor v3 — anon NÃO executa (SR-A-H3)', () => {
  it('anon tenta reclamar_dor → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const { dorId, token } = await criarOrfaComToken(db, 'ana@corp.com', eid)

    await comoAnon(db)
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2)`, [dorId, token]),
    )
    expect(err, 'anon não pode chamar reclamar_dor').toBe(true)
    await db.close()
  })
})
