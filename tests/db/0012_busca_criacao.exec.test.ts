// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon } from './_pglite/harness'

// Onda 3 / CA3-CA8 — busca exata/fuzzy, criação que resolve corrida, coexistência de similares, fila admin.
const A = '00000000-0000-0000-0000-0000000000aa'
const seed = (db: import('@electric-sql/pglite').PGlite) =>
  db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
const criar = async (db: import('@electric-sql/pglite').PGlite, nome: string) =>
  (await db.query<{ id: string }>(`select public.obter_ou_criar_empresa($1) id`, [nome])).rows[0]!.id
const buscar = async (db: import('@electric-sql/pglite').PGlite, q: string) =>
  (await db.query<{ nome_canonico: string }>(`select nome_canonico from public.buscar_empresa($1)`, [q])).rows.map((r) => r.nome_canonico)

describe('0012 busca + criação', () => {
  it('obter_ou_criar resolve corrida/variação e similares coexistem (CA3/CA5/CA6)', async () => {
    const db = await novoBanco(); await seed(db)
    await comoUsuario(db, { uid: A })
    const id1 = await criar(db, 'Nissan')
    expect(await criar(db, 'Nissan Ltda')).toBe(id1) // variação canônica → MESMA empresa
    const id2 = await criar(db, 'Nissan Automóveis') // similar mas distinta → coexiste (não bloqueia)
    expect(id2).not.toBe(id1)
    const id3 = await criar(db, 'Petrobras')
    expect(id3).not.toBe(id1)
    await db.close()
  })

  it('busca exata e fuzzy; negativo não polui; anon pesquisa via RPC (CA4/CA6/CA7)', async () => {
    const db = await novoBanco(); await seed(db)
    await comoUsuario(db, { uid: A })
    await criar(db, 'Nissan')
    expect(await buscar(db, 'Nissan')).toContain('Nissan') // exata (CA4)
    expect(await buscar(db, 'Nissan Automoveis')).toContain('Nissan') // fuzzy sugere (CA6)
    expect(await buscar(db, 'Petrobras')).not.toContain('Nissan') // negativo (CA7)
    await comoAnon(db)
    expect(await buscar(db, 'Nissan')).toContain('Nissan') // anon pesquisa só via RPC (reconciliação G2)
    await db.close()
  })

  it('busca por SUBSTRING case-insensitive (0046): "niss"/"NISSAN"/"issan" acham "Nissan"', async () => {
    const db = await novoBanco(); await seed(db)
    await comoUsuario(db, { uid: A })
    await criar(db, 'Nissan')
    expect(await buscar(db, 'niss')).toContain('Nissan')   // substring parcial (não atingia o trigram)
    expect(await buscar(db, 'NISSAN')).toContain('Nissan') // caixa alta → ignora maiúsc/minúsc
    expect(await buscar(db, 'issan')).toContain('Nissan')  // substring no meio do nome
    expect(await buscar(db, 'Petrobras')).not.toContain('Nissan') // negativo não polui
    await db.close()
  })

  it('fila de possíveis duplicatas é exclusiva do admin (CA8)', async () => {
    const db = await novoBanco(); await seed(db)
    await comoUsuario(db, { uid: A })
    await criar(db, 'Nissan')
    await criar(db, 'Nissan Automoveis')
    // não-admin não acessa a fila
    let negou = false
    try { await db.query(`select * from public.listar_duplicatas_possiveis()`) } catch { negou = true }
    expect(negou).toBe(true)
    await db.exec(`reset role; insert into public.admin_app(user_id) values ('${A}')`)
    await comoUsuario(db, { uid: A })
    const pares = await db.query<{ sim: number }>(`select sim from public.listar_duplicatas_possiveis()`)
    expect(pares.rows.length).toBeGreaterThan(0) // encontra o par parecido
    await db.close()
  })
})
