// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, negado } from './_pglite/harness'

const A = '00000000-0000-0000-0000-0000000000aa'
const B = '00000000-0000-0000-0000-0000000000bb'
const seed = (db: import('@electric-sql/pglite').PGlite) =>
  db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com'),('${B}','b@empresa.com')`)
const conta = async (db: import('@electric-sql/pglite').PGlite, sql: string) =>
  (await db.query<{ n: number }>(sql)).rows[0]?.n

describe('0005 policies RBAC (matriz de visibilidade)', () => {
  it('perfil: vê/edita só o próprio; NÃO pode auto-verificar (column revoke)', async () => {
    const db = await novoBanco()
    await seed(db)
    await comoUsuario(db, { uid: A })
    expect(await conta(db, `select count(*)::int n from public.perfil`)).toBe(1) // só o próprio
    await db.query(`update public.perfil set nome_publico='A' where user_id='${A}'`) // edita o próprio: ok
    expect(await negado(db.query(`update public.perfil set verificado_em=now() where user_id='${A}'`))).toBe(true) // auto-verificar: NEGADO
    expect(await conta(db, `select count(*)::int n from public.perfil where user_id='${B}'`)).toBe(0) // não vê o de B
    await db.close()
  })

  it('vínculos só admin escreve; curso é catálogo público a anon', async () => {
    const db = await novoBanco()
    await seed(db)
    const curso = (
      await db.query<{ id: string }>(
        `insert into public.curso(slug,nome) values ('direito','Direito') returning id`,
      )
    ).rows[0]!.id

    await comoUsuario(db, { uid: A }) // não-admin
    expect(await negado(db.query(`insert into public.coordenador_curso(user_id,curso_id) values ('${A}','${curso}')`))).toBe(true)

    await db.exec(`reset role; insert into public.admin_app(user_id) values ('${A}')`)
    await comoUsuario(db, { uid: A }) // agora admin
    await db.query(`insert into public.coordenador_curso(user_id,curso_id) values ('${A}','${curso}')`) // admin: ok

    await comoAnon(db)
    expect(await conta(db, `select count(*)::int n from public.curso`)).toBeGreaterThan(0) // catálogo público
    await db.close()
  })
})
