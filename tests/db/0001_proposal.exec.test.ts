// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, negado } from './_pglite/harness'

// T0d — RLS da 0001 provada por EXECUÇÃO real (PGlite), não mais por string-match.
// (rls-policies.test.ts permanece como smoke complementar.)
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'

function inserirDor(db: import('@electric-sql/pglite').PGlite, consent = true, userExpr = 'auth.uid()') {
  return db.query(
    `insert into public.proposal(user_id,email,rep_nome,empresa,dor,cursos,consent,consent_version,consent_at)
     values (${userExpr}, auth.email(),'Rep','ACME','uma dor real','{engenharia_de_software}'::curso_ubm[], ${consent}, 'v1', now())`,
  )
}
const conta = async (db: import('@electric-sql/pglite').PGlite) =>
  (await db.query<{ n: number }>(`select count(*)::int n from public.proposal`)).rows[0]?.n

describe('0001 proposal — RLS por execução real', () => {
  it('dono insere/lê a própria; B e anon não veem; viola consent/dono é negado', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@acme.com'),('${B}','b@acme.com')`)

    await comoUsuario(db, { uid: A, email: 'a@acme.com' })
    await inserirDor(db) // dono + consent → permitido
    expect(await conta(db)).toBe(1)

    await comoUsuario(db, { uid: B, email: 'b@acme.com' })
    expect(await conta(db)).toBe(0) // RLS isola por dono (I-01)

    await comoAnon(db)
    expect(await conta(db)).toBe(0) // sem policy p/ anon → nada (deny-by-default)

    await comoUsuario(db, { uid: A, email: 'a@acme.com' })
    expect(await negado(inserirDor(db, false))).toBe(true) // sem consent → negado (RS4)
    expect(await negado(inserirDor(db, true, `'${B}'`))).toBe(true) // user_id != auth.uid() → negado
    await db.close()
  })
})
