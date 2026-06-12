// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, negado } from './_pglite/harness'

// Onda 4 / CA9/CA10/CA11 — merge reaponta vínculos + reversível; só admin.
const A = '00000000-0000-0000-0000-0000000000aa' // admin
const X = '00000000-0000-0000-0000-0000000000c1' // membro da perdedora
const conta = async (db: import('@electric-sql/pglite').PGlite, empresa: string) =>
  (await db.query<{ n: number }>(`select count(*)::int n from public.membro_empresa where empresa_id='${empresa}'`)).rows[0]?.n
const fundida = async (db: import('@electric-sql/pglite').PGlite, id: string) =>
  (await db.query<{ v: boolean }>(`select (merged_into is not null) v from public.empresa where id='${id}'`)).rows[0]?.v

describe('0013 merge reversível', () => {
  it('admin funde (reaponta + marca), não-admin é negado, e desfazer volta ao estado pré-merge', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com'),('${X}','x@empresa.com')`)
    // empresas A(winner) e B(loser); X é membro só de B
    const win = (await db.query<{ id: string }>(`insert into public.empresa(nome_canonico,created_by) values ('Nissan','${A}') returning id`)).rows[0]!.id
    const los = (await db.query<{ id: string }>(`insert into public.empresa(nome_canonico,created_by) values ('Nissan Veiculos','${A}') returning id`)).rows[0]!.id
    await db.exec(`insert into public.membro_empresa(user_id,empresa_id) values ('${X}','${los}')`)

    // não-admin não funde (CA10)
    await comoUsuario(db, { uid: A })
    expect(await negado(db.query(`select public.merge_empresa('${los}','${win}')`))).toBe(true)

    // admin funde (CA9)
    await db.exec(`reset role; insert into public.admin_app(user_id) values ('${A}')`)
    await comoUsuario(db, { uid: A })
    const log = (await db.query<{ id: string }>(`select public.merge_empresa('${los}','${win}') id`)).rows[0]!.id
    expect(await conta(db, win)).toBe(1) // X reapontado para a vencedora
    expect(await conta(db, los)).toBe(0)
    expect(await fundida(db, los)).toBe(true)

    // desfazer volta ao estado pré-merge (CA11)
    await db.query(`select public.desfazer_merge('${log}')`)
    expect(await conta(db, los)).toBe(1) // X de volta na perdedora
    expect(await conta(db, win)).toBe(0) // e removido da vencedora
    expect(await fundida(db, los)).toBe(false) // perdedora ressuscitada
    await db.close()
  })
})
