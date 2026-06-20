// @vitest-environment node
// T-B8 PGlite — migração 0054: listar_coordenadores_pendentes (admin-only)
// Rastreab.: admin-usuarios.ts CoordenadorPendente shape; security design 0053 §2.
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, comoAnon } from './_pglite/harness'

const UID_COORD  = '54000000-0000-0000-0000-000000000001'
const UID_COORD2 = '54000000-0000-0000-0000-000000000002'
const UID_ADM    = '54000000-0000-0000-0000-000000000003'
const UID_OUTRO  = '54000000-0000-0000-0000-000000000004'
const CURSO_ID   = '54000000-0000-0000-0000-000000000010'
const CURSO2_ID  = '54000000-0000-0000-0000-000000000011'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_COORD}',  'coord54@ubm.br'),
      ('${UID_COORD2}', 'coord54b@ubm.br'),
      ('${UID_ADM}',    'admin54@ubm.br'),
      ('${UID_OUTRO}',  'outro54@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    update public.perfil set nome_publico = 'Prof. Coord A' where user_id = '${UID_COORD}';
    update public.perfil set nome_publico = 'Prof. Coord B' where user_id = '${UID_COORD2}';
    insert into public.curso(id, slug, nome) values
      ('${CURSO_ID}',  'direito',   'Direito'),
      ('${CURSO2_ID}', 'farmacia',  'Farmácia');
  `)
}

// ── Shape da RPC (espelha CoordenadorPendente de admin-usuarios.ts) ───────────
interface CoordenadorPendente {
  id:          string
  user_id:     string
  nome:        string
  email:       string
  curso_id:    string
  curso_label: string
  aprovado:    boolean
}

describe('0054 listar_coordenadores_pendentes — shape e gates', () => {
  it('RPC existe após migração', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'listar_coordenadores_pendentes'`
    )).rows
    expect(rows).toHaveLength(1)
    await db.close()
  })

  it('admin vê coordenadores pendentes com shape completo', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    // Insere vínculo PENDENTE (aprovado=false)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', false)`
    )
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<CoordenadorPendente>(
      `select * from public.listar_coordenadores_pendentes() order by nome`
    )).rows

    expect(rows).toHaveLength(1)
    const r = rows[0]!
    // Shape exato de CoordenadorPendente (admin-usuarios.ts:39-47)
    expect(r.user_id).toBe(UID_COORD)
    expect(r.nome).toBe('Prof. Coord A')
    expect(r.email).toBe('coord54@ubm.br')
    expect(r.curso_id).toBe(CURSO_ID)
    expect(r.curso_label).toBe('Direito')
    expect(r.aprovado).toBe(false)
    // id deve existir e ser não-nulo
    expect(r.id).toBeTruthy()
    await db.close()
  })

  it('retorna múltiplos pendentes ordenados por created_at asc', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado) values
       ('${UID_COORD}',  '${CURSO_ID}',  false),
       ('${UID_COORD2}', '${CURSO2_ID}', false)`
    )
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<{ user_id: string }>(
      `select user_id from public.listar_coordenadores_pendentes()`
    )).rows
    expect(rows).toHaveLength(2)
    await db.close()
  })

  it('NÃO retorna coordenadores já aprovados (aprovado=true)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    // Um pendente, um aprovado
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado) values
       ('${UID_COORD}',  '${CURSO_ID}',  false),
       ('${UID_COORD2}', '${CURSO2_ID}', true)`
    )
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<{ user_id: string }>(
      `select user_id from public.listar_coordenadores_pendentes()`
    )).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]!.user_id).toBe(UID_COORD)
    await db.close()
  })

  it('não-admin recebe retorno vazio (padrão peça lacrada)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', false)`
    )
    await comoUsuario(db, { uid: UID_OUTRO })
    const rows = (await db.query<{ user_id: string }>(
      `select user_id from public.listar_coordenadores_pendentes()`
    )).rows
    expect(rows).toHaveLength(0)
    await db.close()
  })

  it('lista vazia quando não há pendentes', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<{ user_id: string }>(
      `select user_id from public.listar_coordenadores_pendentes()`
    )).rows
    expect(rows).toHaveLength(0)
    await db.close()
  })

  it('anon não tem execute na RPC (hardening — default privileges gotcha)', async () => {
    const db = await novoBanco()
    const ok = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.listar_coordenadores_pendentes()', 'execute') ok`
    )).rows[0]!.ok
    expect(ok).toBe(false)
    await db.close()
  })

  it('authenticated tem execute na RPC', async () => {
    const db = await novoBanco()
    const ok = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('authenticated', 'public.listar_coordenadores_pendentes()', 'execute') ok`
    )).rows[0]!.ok
    expect(ok).toBe(true)
    await db.close()
  })

  it('nome null em perfil retorna string vazia (não quebra)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    // Insere usuário sem nome_publico (perfil com null)
    await db.query(`update public.perfil set nome_publico = null where user_id = '${UID_COORD}'`)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', false)`
    )
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<{ nome: string }>(
      `select nome from public.listar_coordenadores_pendentes()`
    )).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]!.nome).toBe('') // coalesce null → ''
    await db.close()
  })
})
