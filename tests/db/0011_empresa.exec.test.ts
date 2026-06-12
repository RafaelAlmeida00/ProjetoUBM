// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

// Ondas 1-2 / CA1/CA2/CA12/CA15 — normalização canônica, unicidade, FK, RLS.
const A = '00000000-0000-0000-0000-0000000000aa'
const seed = (db: import('@electric-sql/pglite').PGlite) =>
  db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
const norm = async (db: import('@electric-sql/pglite').PGlite, s: string) =>
  (await db.query<{ n: string }>(`select public.normalizar_empresa($1) n`, [s])).rows[0]?.n

describe('0011 empresa canônica', () => {
  it('normalização colapsa casing/acento/sufixo e preserva ACME (CA1)', async () => {
    const db = await novoBanco()
    const n = await norm(db, 'Nissan')
    expect(await norm(db, 'NISSAN')).toBe(n)
    expect(await norm(db, 'Nissan Ltda')).toBe(n)
    expect(await norm(db, 'Nissan S/A ')).toBe(n)
    expect(await norm(db, 'Nissan S.A.')).toBe(n)
    expect(await norm(db, 'ACME')).toBe('acme') // sufixo 'me' dentro da palavra NÃO é removido
    await db.close()
  })

  it('unicidade canônica: 2ª variação viola UNIQUE (CA2); reúso após delete (A4)', async () => {
    const db = await novoBanco(); await seed(db)
    await comoUsuario(db, { uid: A })
    await db.query(`insert into public.empresa(nome_canonico, created_by) values ('Nissan', '${A}')`)
    expect(await negado(db.query(`insert into public.empresa(nome_canonico, created_by) values ('Nissan Ltda', '${A}')`))).toBe(true)
    // soft-delete libera o nome
    await db.exec(`reset role; update public.empresa set deleted_at = now() where nome_normalizado = 'nissan'`)
    await comoUsuario(db, { uid: A })
    await db.query(`insert into public.empresa(nome_canonico, created_by) values ('Nissan', '${A}')`) // reuso ok
    await db.close()
  })

  it('FK membro_empresa->empresa (CA12) e RLS: não-admin não altera/exclui (CA15)', async () => {
    const db = await novoBanco(); await seed(db)
    await comoServiceRole(db)
    expect(await negado(db.query(`insert into public.membro_empresa(user_id,empresa_id) values ('${A}','00000000-0000-0000-0000-0000000000ff')`))).toBe(true) // empresa inexistente -> FK

    await comoUsuario(db, { uid: A })
    const emp = (await db.query<{ id: string }>(`insert into public.empresa(nome_canonico, created_by) values ('Acme Corp','${A}') returning id`)).rows[0]!.id
    // RLS nega UPDATE/DELETE afetando 0 linhas (sem exceção) → asserta que NADA mudou
    await db.query(`update public.empresa set nome_canonico='X' where id='${emp}'`)
    await db.query(`delete from public.empresa where id='${emp}'`)
    const r = await db.query<{ nome: string }>(`select nome_canonico nome from public.empresa where id='${emp}'`)
    expect(r.rows[0]?.nome).toBe('Acme Corp') // não-admin não editou nem excluiu
    await db.close()
  })
})
