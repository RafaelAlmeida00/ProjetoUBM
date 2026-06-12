// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, negado } from './_pglite/harness'

// Onda 5 / CA14/CA16 — auditoria: mutação grava ator+antes/depois; log só admin.
const A = '00000000-0000-0000-0000-0000000000aa'
const seed = (db: import('@electric-sql/pglite').PGlite) =>
  db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)

describe('0008 auditoria', () => {
  it('toda mutação grava ator + antes/depois (CA14)', async () => {
    const db = await novoBanco()
    await seed(db)
    await comoUsuario(db, { uid: A })
    await db.query(`update public.perfil set nome_publico='Novo' where user_id='${A}'`)
    await db.exec('reset role')
    const r = await db.query<{ actor_id: string; op: string; record: { nome_publico: string }; old_record: unknown }>(
      `select actor_id, op, record, old_record from audit.record_version
       where tabela='public.perfil' and op='UPDATE' order by ts desc limit 1`,
    )
    expect(r.rows[0]?.actor_id).toBe(A) // ator real capturado na transação
    expect(r.rows[0]?.record.nome_publico).toBe('Novo')
    expect(r.rows[0]?.old_record).toBeTruthy()
    await db.close()
  })

  it('log é legível só por admin e não acessível direto pelo app (CA16/RN16)', async () => {
    const db = await novoBanco()
    await seed(db)
    await comoUsuario(db, { uid: A }) // não-admin
    expect(await negado(db.query(`select * from public.ler_audit()`))).toBe(true) // RPC barra não-admin
    expect(await negado(db.query(`select * from audit.record_version`))).toBe(true) // schema não exposto

    await db.exec(`reset role; insert into public.admin_app(user_id) values ('${A}')`)
    await comoUsuario(db, { uid: A }) // admin
    const r = await db.query<{ n: number }>(`select count(*)::int n from public.ler_audit()`)
    expect(r.rows[0]?.n).toBeGreaterThan(0)
    await db.close()
  })
})
