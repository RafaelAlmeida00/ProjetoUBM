// @vitest-environment node
// T-AN2 RED — 0040 porta anon: submeter_dor_landing estendida, ramo logado×anon
// Rastreab.: CA21, CA23 · RN16, RN4 · SR-A1, SR-A2, SR-A7, SR-A8, SR-A9 · STRIDE T-A02/E-A01
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

// ─── Ramo anônimo (caminho novo) ──────────────────────────────────────────────
describe('0040 porta anon — anon cria dor órfã', () => {
  it('anon chama submeter_dor_landing e cria órfã (autor_id null, em_moderacao, claim_email setado)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const rows = (await db.query<{ out_dor_id: string }>(
      `select * from public.submeter_dor_landing(
         $1, $2, $3, $4, $5, $6, $7, $8, null,
         $9, null
       )`,
      [eid, 'dor anon test', 'Rep Anon', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
    )).rows
    expect(rows.length, 'deve retornar uuid da dor').toBe(1)
    expect(rows[0]!.out_dor_id).toBeTruthy()

    // Verifica que a dor foi criada com autor_id null e claim_email
    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string | null; status_dor: string; claim_email: string }>(
      `select autor_id, status_dor, claim_email from public.dor where id = $1`,
      [rows[0]!.out_dor_id]
    )).rows[0]!
    expect(dor.autor_id, 'autor_id deve ser null para órfã').toBeNull()
    expect(dor.status_dor, 'status deve ser em_moderacao').toBe('em_moderacao')
    expect(dor.claim_email, 'claim_email deve estar setado').toBeTruthy()
    expect(dor.claim_email, 'claim_email deve estar normalizado (lowercase)').toBe('anon@corp.com')
    await db.close()
  })

  it('anon com e-mail genérico @gmail.com → negado (SR-A8/CA23)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8, null,
           $9, null
         )`,
        [eid, 'dor anon gmail', 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'joao@gmail.com']
      )
    )
    expect(err, 'e-mail genérico deve ser negado').toBe(true)
    await db.close()
  })

  it('anon sem consentimento → negado (SR-A9)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select public.submeter_dor_landing(
           $1, $2, $3, $4, $5, false, null, null, null,
           $6, null
         )`,
        [eid, 'dor anon sem consent', 'Rep', 'TI', 'Dev', 'anon@corp.com']
      )
    )
    expect(err, 'sem consentimento deve ser negado').toBe(true)
    await db.close()
  })

  it('anon com descrição vazia → negada', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8, null,
           $9, null
         )`,
        [eid, '   ', 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
      )
    )
    expect(err, 'descrição vazia deve ser negada').toBe(true)
    await db.close()
  })

  it('anon com curso fora do enum → negado (cast inválido)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const err = await negado(
      db.query(
        `select public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8,
           array['curso_invalido_xyzabc']::text[]::public.curso_ubm[],
           $9, null
         )`,
        [eid, 'dor anon curso', 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'anon@corp.com']
      )
    )
    expect(err, 'curso inválido deve ser negado').toBe(true)
    await db.close()
  })
})

// ─── Ramo logado (regressão do caminho legado) ────────────────────────────────
describe('0040 porta anon — logado mantém comportamento legado (regressão)', () => {
  it('logado chama submeter_dor_landing e grava autor_id=uid (regressão)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const rows = (await db.query<{ out_dor_id: string }>(
      // assinatura estendida: p_email e p_empresa_nome podem ser omitidos no logado
      `select * from public.submeter_dor_landing(
         $1, $2, $3, $4, $5, $6, $7, $8, null,
         null, null
       )`,
      [eid, 'dor logado legado', 'Rep', 'Eng', 'Gerente', true, 'v1', new Date().toISOString()]
    )).rows
    expect(rows.length).toBe(1)
    expect(rows[0]!.out_dor_id).toBeTruthy()

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string; status_dor: string }>(
      `select autor_id, status_dor from public.dor where id = $1`,
      [rows[0]!.out_dor_id]
    )).rows[0]!
    expect(dor.autor_id, 'logado deve gravar autor_id=uid').toBe(REP)
    expect(dor.status_dor).toBe('em_moderacao')
    await db.close()
  })

  it('logado com e-mail genérico continua sendo negado (regressão I4)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    await db.exec(`insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000ff', 'joao@gmail.com')`)

    await comoUsuario(db, { uid: '00000000-0000-0000-0000-0000000000ff', email: 'joao@gmail.com' })
    const err = await negado(
      db.query(
        `select public.submeter_dor_landing(
           $1, $2, $3, $4, $5, $6, $7, $8, null,
           null, null
         )`,
        [eid, 'dor logado gmail', 'Joao', 'TI', 'Dev', true, 'v1', new Date().toISOString()]
      )
    )
    expect(err, 'logado com email genérico deve continuar negado').toBe(true)
    await db.close()
  })
})
