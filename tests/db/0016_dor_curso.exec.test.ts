// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

// Onda 1 / T-O1.2 — tabela dor_curso (N:N reusando enum curso_ubm), RLS espelha dor.
// CA5 · RN8.
const A = '00000000-0000-0000-0000-0000000000aa'
const B = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedComDor(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id,email) values ('${A}','a@empresa.com'),('${B}','b@empresa.com'),('${ADM}','adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Nissan','${A}');
  `)
}

async function criarDor(db: import('@electric-sql/pglite').PGlite, status: string = 'rascunho'): Promise<string> {
  const empId = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  if (status === 'publicada') {
    return (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at,aprovado_por,aprovado_em,publicada_em)
       values ('${A}','${empId}','publicada','dor test','Rep A',true,'v1',now(),'${ADM}',now(),now()) returning id`
    )).rows[0]!.id
  } else if (status === 'rejeitada') {
    return (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at,motivo_rejeicao)
       values ('${A}','${empId}','rejeitada','dor test','Rep A',true,'v1',now(),'spam') returning id`
    )).rows[0]!.id
  } else {
    return (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${A}','${empId}','${status}','dor test','Rep A',true,'v1',now()) returning id`
    )).rows[0]!.id
  }
}

describe('0016 dor_curso (N:N cursos sugeridos)', () => {
  it('tabela dor_curso existe com PK composta (dor_id, curso) (CA5/RN8)', async () => {
    const db = await novoBanco()
    const cols = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema='public' and table_name='dor_curso' order by ordinal_position`
    )).rows.map(r => r.column_name)
    expect(cols).toContain('dor_id')
    expect(cols).toContain('curso')
    // PK composta
    const pk = (await db.query<{ n: number }>(
      `select count(*)::int n from information_schema.table_constraints
       where table_schema='public' and table_name='dor_curso' and constraint_type='PRIMARY KEY'`
    )).rows[0]!.n
    expect(pk).toBe(1)
    await db.close()
  })

  it('associa cursos da lista fechada à dor; duplicar o mesmo curso é negado (CA5/RN8)', async () => {
    const db = await novoBanco(); await seedComDor(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', 'engenharia_de_software')`)
    await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', 'direito')`)
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.dor_curso where dor_id='${dorId}'`)).rows[0]!.n
    expect(n).toBe(2)
    // duplicar mesmo curso → violação de PK
    expect(await negado(db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', 'engenharia_de_software')`))).toBe(true)
    await db.close()
  })

  it('dor sem curso é válida (CA5 — opcional)', async () => {
    const db = await novoBanco(); await seedComDor(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.dor_curso where dor_id='${dorId}'`)).rows[0]!.n
    expect(n).toBe(0)
    await db.close()
  })

  it('nao_sei é aceito como curso (CA5/RN8 — lista fechada inclui nao_sei)', async () => {
    const db = await novoBanco(); await seedComDor(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', 'nao_sei')`)
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.dor_curso where dor_id='${dorId}' and curso='nao_sei'`)).rows[0]!.n
    expect(n).toBe(1)
    await db.close()
  })

  it('on delete cascade: deletar a dor remove os cursos associados', async () => {
    const db = await novoBanco(); await seedComDor(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', 'direito')`)
    await db.query(`delete from public.dor where id='${dorId}'`)
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.dor_curso where dor_id='${dorId}'`)).rows[0]!.n
    expect(n).toBe(0)
    await db.close()
  })

  it('RLS: anon só vê cursos de dor publicada (espelha visibilidade da dor pai)', async () => {
    const db = await novoBanco(); await seedComDor(db)
    await comoServiceRole(db)
    const dorRascId = await criarDor(db, 'rascunho')
    const dorPubId = await criarDor(db, 'publicada')
    await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorRascId}', 'direito')`)
    await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorPubId}', 'medicina_veterinaria')`)

    await comoAnon(db)
    const rows = (await db.query<{ dor_id: string }>(`select dor_id from public.dor_curso`)).rows
    expect(rows.map(r => r.dor_id)).toContain(dorPubId)
    expect(rows.map(r => r.dor_id)).not.toContain(dorRascId)
    await db.close()
  })

  it('RLS: terceiro não vê cursos de dor não-publicada do autor A (espelha dor pai)', async () => {
    const db = await novoBanco(); await seedComDor(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db, 'em_moderacao')
    await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', 'psicologia')`)

    await comoUsuario(db, { uid: B })
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.dor_curso where dor_id='${dorId}'`)).rows[0]!.n
    expect(n).toBe(0)
    await db.close()
  })

  it('sentinela: dor_curso tem RLS enable+force', async () => {
    const db = await novoBanco()
    const row = (await db.query<{ en: boolean; fo: boolean }>(
      `select relrowsecurity en, relforcerowsecurity fo from pg_class
       where relname='dor_curso' and relnamespace=(select oid from pg_namespace where nspname='public')`
    )).rows[0]
    expect(row?.en).toBe(true)
    expect(row?.fo).toBe(true)
    await db.close()
  })

  it('trigger de auditoria grava inserção em dor_curso', async () => {
    const db = await novoBanco(); await seedComDor(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', 'enfermagem')`)
    await db.exec('reset role')
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version where tabela='public.dor_curso' and op='INSERT'`
    )).rows[0]!.n
    expect(n).toBeGreaterThan(0)
    await db.close()
  })
})
