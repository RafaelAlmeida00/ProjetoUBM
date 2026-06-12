// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

// Onda 1 / T-O1.1 — tabela dor, enum status_dor, RLS por estado.
// CA1, CA17, CA18, CA19 (parte RLS) · RN1, RN5, RN6, RN17, RN18, RN20.
const A = '00000000-0000-0000-0000-0000000000aa' // autor representante
const B = '00000000-0000-0000-0000-0000000000bb' // terceiro
const ADM = '00000000-0000-0000-0000-0000000000cc' // admin

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id,email) values ('${A}','a@empresa.com'),('${B}','b@empresa.com'),('${ADM}','adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Nissan','${A}');
  `)
}

async function empresaId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa where nome_canonico='Nissan' limit 1`)).rows[0]!.id
}

describe('0015 enum status_dor + tabela dor + RLS', () => {
  it('enum status_dor tem os 4 valores e tabela dor existe com constraints (RN1)', async () => {
    const db = await novoBanco()
    // enum existe
    const vals = (await db.query<{ v: string }>(`select unnest(enum_range(null::status_dor))::text v`)).rows.map(r => r.v)
    expect(vals).toEqual(expect.arrayContaining(['rascunho','em_moderacao','publicada','rejeitada']))
    expect(vals.length).toBe(4)
    // tabela existe com colunas esperadas
    const cols = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema='public' and table_name='dor' order by ordinal_position`
    )).rows.map(r => r.column_name)
    for (const c of ['id','autor_id','empresa_id','status_dor','descricao','rep_nome','consentimento','aprovado_por','aprovado_em','motivo_rejeicao','publicada_em','created_at','deleted_at']) {
      expect(cols, `coluna ${c} deve existir`).toContain(c)
    }
    await db.close()
  })

  it('constraint: rejeitada exige motivo_rejeicao (RS-D5)', async () => {
    const db = await novoBanco(); await seedBase(db)
    const empId = await empresaId(db)
    // insere via service_role para bypassing RLS e testar constraint
    await comoServiceRole(db)
    const dorId = (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${A}','${empId}','em_moderacao','dor test','Rep A',true,'v1',now()) returning id`
    )).rows[0]!.id
    // tentar marcar rejeitada sem motivo deve falhar
    expect(await negado(db.query(`update public.dor set status_dor='rejeitada' where id='${dorId}'`))).toBe(true)
    // com motivo funciona
    await db.query(`update public.dor set status_dor='rejeitada', motivo_rejeicao='spam' where id='${dorId}'`)
    const s = (await db.query<{ s: string }>(`select status_dor::text s from public.dor where id='${dorId}'`)).rows[0]!.s
    expect(s).toBe('rejeitada')
    await db.close()
  })

  it('constraint: publicada exige aprovado_por + publicada_em (RS-D6)', async () => {
    const db = await novoBanco(); await seedBase(db)
    const empId = await empresaId(db)
    // Para publicar, o trigger (0018) exige A1: aprovado_por NOT NULL ∧ perfil.verificado_em NOT NULL.
    // O trigger chama dor_publicavel() que lê o estado PERSISTIDO da linha — portanto a aprovação
    // deve ser feita em 2 passos (como faz moderar_dor): primeiro persiste aprovado_por, depois muda status.
    await db.exec(`update public.perfil set verificado_em = now() where user_id = '${A}'`)
    await comoServiceRole(db)
    const dorId = (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${A}','${empId}','em_moderacao','dor test','Rep A',true,'v1',now()) returning id`
    )).rows[0]!.id
    // tentar publicar sem aprovado_por deve falhar (CHECK constraint dor_publicada_exige_aprovacao)
    expect(await negado(db.query(`update public.dor set status_dor='publicada', publicada_em=now() where id='${dorId}'`))).toBe(true)
    // publicar em 2 passos (como faz moderar_dor):
    //   1) persiste aprovado_por+aprovado_em (status fica em em_moderacao — trigger aceita)
    await db.query(`update public.dor set aprovado_por='${ADM}', aprovado_em=now() where id='${dorId}'`)
    //   2) muda status para publicada — trigger lê aprovado_por já persistido → A1 satisfeita
    await db.query(`update public.dor set status_dor='publicada', publicada_em=now() where id='${dorId}'`)
    const s = (await db.query<{ s: string }>(`select status_dor::text s from public.dor where id='${dorId}'`)).rows[0]!.s
    expect(s).toBe('publicada')
    await db.close()
  })

  it('constraint: aprovado_por e aprovado_em devem ser nulos ou não-nulos juntos (atomicidade)', async () => {
    const db = await novoBanco(); await seedBase(db)
    const empId = await empresaId(db)
    await comoServiceRole(db)
    const dorId = (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${A}','${empId}','em_moderacao','dor test','Rep A',true,'v1',now()) returning id`
    )).rows[0]!.id
    // só aprovado_por sem aprovado_em deve falhar
    expect(await negado(db.query(`update public.dor set aprovado_por='${ADM}' where id='${dorId}'`))).toBe(true)
    await db.close()
  })

  it('RLS: anon e terceiro NÃO veem rascunho/em_moderacao/rejeitada (CA18) mas veem publicada (CA17)', async () => {
    const db = await novoBanco(); await seedBase(db)
    const empId = await empresaId(db)
    await comoServiceRole(db)
    // cria dores em vários estados
    const rascId = (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${A}','${empId}','rascunho','rascunho','Rep A',true,'v1',now()) returning id`
    )).rows[0]!.id
    const modId = (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${A}','${empId}','em_moderacao','em mod','Rep A',true,'v1',now()) returning id`
    )).rows[0]!.id
    const pubId = (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at,aprovado_por,aprovado_em,publicada_em)
       values ('${A}','${empId}','publicada','publicada','Rep A',true,'v1',now(),'${ADM}',now(),now()) returning id`
    )).rows[0]!.id
    const rejId = (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at,motivo_rejeicao)
       values ('${A}','${empId}','rejeitada','rejeitada','Rep A',true,'v1',now(),'spam') returning id`
    )).rows[0]!.id

    // anon só vê publicada
    await comoAnon(db)
    const anonRows = (await db.query<{ id: string }>(`select id from public.dor`)).rows.map(r => r.id)
    expect(anonRows).toContain(pubId)
    expect(anonRows).not.toContain(rascId)
    expect(anonRows).not.toContain(modId)
    expect(anonRows).not.toContain(rejId)

    // terceiro (B) não vê rascunho/mod/rej do A
    await comoUsuario(db, { uid: B })
    const bRows = (await db.query<{ id: string }>(`select id from public.dor`)).rows.map(r => r.id)
    expect(bRows).toContain(pubId)
    expect(bRows).not.toContain(rascId)
    expect(bRows).not.toContain(modId)
    expect(bRows).not.toContain(rejId)

    await db.close()
  })

  it('RLS: autor vê as PRÓPRIAS dores em qualquer estado (CA18/CA19)', async () => {
    const db = await novoBanco(); await seedBase(db)
    const empId = await empresaId(db)
    await comoServiceRole(db)
    await db.query(`
      insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
      values ('${A}','${empId}','rascunho','rascunho','Rep A',true,'v1',now()),
             ('${A}','${empId}','em_moderacao','em mod','Rep A',true,'v1',now())
    `)
    await comoUsuario(db, { uid: A })
    const rows = (await db.query<{ n: number }>(`select count(*)::int n from public.dor`)).rows[0]!.n
    expect(rows).toBe(2) // vê as 2 próprias
    await db.close()
  })

  it('RLS: admin vê tudo (CA18)', async () => {
    const db = await novoBanco(); await seedBase(db)
    const empId = await empresaId(db)
    await comoServiceRole(db)
    await db.query(`
      insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
      values ('${A}','${empId}','rascunho','rascunho','Rep A',true,'v1',now()),
             ('${B}','${empId}','em_moderacao','em mod B','Rep B',true,'v1',now())
    `)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<{ n: number }>(`select count(*)::int n from public.dor`)).rows[0]!.n
    expect(rows).toBe(2)
    await db.close()
  })

  it('RLS: soft-delete some da listagem (RN20)', async () => {
    const db = await novoBanco(); await seedBase(db)
    const empId = await empresaId(db)
    await comoServiceRole(db)
    const dorId = (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at,aprovado_por,aprovado_em,publicada_em)
       values ('${A}','${empId}','publicada','pub','Rep A',true,'v1',now(),'${ADM}',now(),now()) returning id`
    )).rows[0]!.id
    // publicada visível a anon
    await comoAnon(db)
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.dor`)).rows[0]!.n).toBe(1)
    // soft-delete
    await db.exec(`reset role; update public.dor set deleted_at=now() where id='${dorId}'`)
    await comoAnon(db)
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.dor`)).rows[0]!.n).toBe(0)
    await db.close()
  })

  it('sentinela: tabela dor tem RLS enable+force', async () => {
    const db = await novoBanco()
    const row = (await db.query<{ en: boolean; fo: boolean }>(
      `select relrowsecurity en, relforcerowsecurity fo from pg_class where relname='dor' and relnamespace=(select oid from pg_namespace where nspname='public')`
    )).rows[0]
    expect(row?.en).toBe(true)
    expect(row?.fo).toBe(true)
    await db.close()
  })

  it('trigger de auditoria grava versão (RN20)', async () => {
    const db = await novoBanco(); await seedBase(db)
    const empId = await empresaId(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${A}','${empId}','rascunho','dor test','Rep A',true,'v1',now())`
    )
    await db.exec('reset role')
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version where tabela='public.dor' and op='INSERT'`
    )).rows[0]!.n
    expect(n).toBeGreaterThan(0)
    await db.close()
  })
})
