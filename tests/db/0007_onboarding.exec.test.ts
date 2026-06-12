// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, negado } from './_pglite/harness'

// Onda 3 / CA23/CA1/CA2 — onboarding de papel + e-mail corporativo + acúmulo de papéis.
const A = '00000000-0000-0000-0000-0000000000aa' // gmail (pessoal)
const B = '00000000-0000-0000-0000-0000000000bb' // corporativo
const seed = (db: import('@electric-sql/pglite').PGlite) =>
  db.exec(`insert into auth.users(id,email) values ('${A}','a@gmail.com'),('${B}','b@empresa.com')`)
const papeis = async (db: import('@electric-sql/pglite').PGlite, uid: string) =>
  (await db.query<{ role: string }>(`select role from public.papel_usuario where user_id='${uid}' order by role`)).rows.map((r) => r.role)

describe('0007 onboarding + e-mail corporativo', () => {
  it('representante exige e-mail corporativo (CA23); aluno/coordenador livres', async () => {
    const db = await novoBanco()
    await seed(db)
    await comoUsuario(db, { uid: A, email: 'a@gmail.com' })
    expect(await negado(db.query(`select public.assumir_papel('representante')`))).toBe(true) // gmail → recusa
    await db.query(`select public.assumir_papel('aluno')`) // ok
    expect(await papeis(db, A)).toEqual(['aluno'])

    await comoUsuario(db, { uid: B, email: 'b@empresa.com' })
    await db.query(`select public.assumir_papel('representante')`) // corporativo → ok
    expect(await papeis(db, B)).toEqual(['representante'])
    await db.close()
  })

  it('papéis são acumuláveis e idempotentes (CA1/CA2)', async () => {
    const db = await novoBanco()
    await seed(db)
    await comoUsuario(db, { uid: A, email: 'a@gmail.com' })
    await db.query(`select public.assumir_papel('aluno')`)
    await db.query(`select public.assumir_papel('coordenador')`)
    await db.query(`select public.assumir_papel('aluno')`) // repetido: idempotente
    expect(await papeis(db, A)).toEqual(['aluno', 'coordenador'])
    await db.close()
  })
})
