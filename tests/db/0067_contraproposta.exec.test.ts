// @vitest-environment node
/**
 * T1.4 — 0067_contraproposta (E19)
 *
 * RED: tabela não existe (migração 0067 ainda não aplicada).
 * GREEN: tabela existe, constraint de motivo e RLS espelhando o documento.
 *
 * Casos testados:
 *   (a) motivo vazio / só espaços rejeitado pela check constraint (RN14/CA11)
 *   (b) aluno NÃO vê o motivo (RN19/CA19)
 *   (c) anon NÃO vê (RS1)
 *   (d) terceiro sem vínculo NÃO vê
 *   (e) host (coordinator) VÊ
 *   (f) representante da empresa VÊ
 *   (g) admin VÊ
 *   (h) tabela tem RLS enable + force
 *
 * spec: RN14/RN19/CA11/CA19 · RS1/RS2 · arch §4.3
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

const HOST  = '00000000-0000-0000-0000-000000000001'
const REP   = '00000000-0000-0000-0000-000000000002'
const ALUNO = '00000000-0000-0000-0000-000000000003'
const ADM   = '00000000-0000-0000-0000-000000000004'
const TERC  = '00000000-0000-0000-0000-000000000005'
const CURSO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

let db: PGlite
let empresaId: string
let projetoId: string
let docId: string
let contraId: string

async function seed() {
  await db.exec(`
    insert into auth.users(id,email) values
      ('${HOST}','host@ubm.br'),
      ('${REP}','rep@ubm.br'),
      ('${ALUNO}','aluno@ubm.br'),
      ('${ADM}','adm@ubm.br'),
      ('${TERC}','terc@ubm.br');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('EmpTeste','${REP}');
    update public.perfil set verificado_em=now()
      where user_id in ('${HOST}','${REP}','${ALUNO}','${TERC}');
    insert into public.curso(id,slug,nome) values ('${CURSO}','direito','Direito');
    insert into public.coordenador_curso(user_id,curso_id,aprovado)
      values ('${HOST}','${CURSO}',true);
  `)

  empresaId = (
    await db.query<{ id: string }>(`select id from public.empresa limit 1`)
  ).rows[0]!.id

  await db.exec(
    `insert into public.membro_empresa(user_id,empresa_id,papel)
     values ('${REP}','${empresaId}','representante')`,
  )

  await comoServiceRole(db)
  const dorId = (
    await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${ALUNO}','${empresaId}','em_moderacao','Dor','Rep',true,'v1',now()) returning id`,
    )
  ).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id,curso) values ('${dorId}','direito')`)

  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}','aprovar',null)`)

  await comoServiceRole(db)
  projetoId = (
    await db.query<{ id: string }>(
      `select id from public.projeto where dor_id='${dorId}'`,
    )
  ).rows[0]!.id

  await comoUsuario(db, { uid: HOST })
  await db.query(`select public.indicar_se('${projetoId}','coordenador',null)`)
  await comoUsuario(db, { uid: ALUNO })
  await db.query(`select public.indicar_se('${projetoId}','aluno','quero')`)

  await comoServiceRole(db)
  const indHost = (
    await db.query<{ id: string }>(
      `select id from public.indicacao where projeto_id='${projetoId}' and pessoa_id='${HOST}'`,
    )
  ).rows[0]!.id
  const indAluno = (
    await db.query<{ id: string }>(
      `select id from public.indicacao where projeto_id='${projetoId}' and pessoa_id='${ALUNO}'`,
    )
  ).rows[0]!.id

  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.eleger_host('${projetoId}','${HOST}')`)
  await comoUsuario(db, { uid: HOST })
  await db.query(`select public.fechar_equipe('${projetoId}','${HOST}','[
    {"pessoa_id":"${HOST}","papel_projeto":"host","indicacao_id":"${indHost}"},
    {"pessoa_id":"${ALUNO}","papel_projeto":"aluno","indicacao_id":"${indAluno}"}
  ]')`)
  await db.query(`select public.avancar_projeto('${projetoId}')`)

  // documento de proposta via service_role
  await comoServiceRole(db)
  docId = (
    await db.query<{ id: string }>(
      `insert into public.documento_proposta
         (projeto_id, tipo, empresa_id, enviado_por, storage_path_original, created_by)
       values ('${projetoId}','proposta','${empresaId}','${HOST}','propostas/orig.pdf','${HOST}')
       returning id`,
    )
  ).rows[0]!.id

  // contraproposta válida via service_role (simula o que a RPC fará)
  contraId = (
    await db.query<{ id: string }>(
      `insert into public.contraproposta
         (projeto_id, documento_id, motivo, criado_por)
       values ('${projetoId}','${docId}','Preço muito elevado — revisar.','${REP}')
       returning id`,
    )
  ).rows[0]!.id
}

beforeEach(async () => {
  db = await novoBanco()
  await seed()
})
afterEach(async () => { await db.close() })

async function countContra() {
  return (
    await db.query<{ n: number }>(
      `select count(*)::int n from public.contraproposta where id='${contraId}'`,
    )
  ).rows[0]!.n
}

describe('0067 contraproposta — constraint motivo + RLS (RN14/RN19/CA11/CA19)', () => {
  it('(h) tabela tem RLS habilitada e forçada', async () => {
    await comoServiceRole(db)
    const r = await db.query<{ rowsecurity: boolean; forcepolicy: boolean }>(
      `select relrowsecurity as rowsecurity, relforcerowsecurity as forcepolicy
       from pg_class
       where relname='contraproposta' and relnamespace='public'::regnamespace`,
    )
    expect(r.rows[0]!.rowsecurity).toBe(true)
    expect(r.rows[0]!.forcepolicy).toBe(true)
  })

  it('(a) motivo vazio string é rejeitado pela check constraint (CA11)', async () => {
    await comoServiceRole(db)
    expect(
      await negado(
        db.query(
          `insert into public.contraproposta(projeto_id,documento_id,motivo,criado_por)
           values ('${projetoId}','${docId}','','${REP}')`,
        ),
      ),
    ).toBe(true)
  })

  it('(a) motivo só espaços é rejeitado pela check constraint (btrim — CA11)', async () => {
    await comoServiceRole(db)
    expect(
      await negado(
        db.query(
          `insert into public.contraproposta(projeto_id,documento_id,motivo,criado_por)
           values ('${projetoId}','${docId}','   ','${REP}')`,
        ),
      ),
    ).toBe(true)
  })

  it('(a) motivo com conteúdo real é aceito', async () => {
    await comoServiceRole(db)
    await expect(
      db.query(
        `insert into public.contraproposta(projeto_id,documento_id,motivo,criado_por)
         values ('${projetoId}','${docId}','Valor acima do orçamento.','${REP}')`,
      ),
    ).resolves.toBeTruthy()
  })

  it('(c) anon NÃO vê o motivo (deny-by-default — RS1)', async () => {
    await comoAnon(db)
    expect(await countContra()).toBe(0)
  })

  it('(d) terceiro sem vínculo NÃO vê o motivo', async () => {
    await comoUsuario(db, { uid: TERC })
    expect(await countContra()).toBe(0)
  })

  it('(b) aluno da equipe NÃO vê o motivo (RN19/CA19)', async () => {
    await comoUsuario(db, { uid: ALUNO })
    expect(await countContra()).toBe(0)
  })

  it('(e) host (coordinator) VÊ o motivo (RN19/CA19)', async () => {
    await comoUsuario(db, { uid: HOST })
    expect(await countContra()).toBe(1)
  })

  it('(f) representante da empresa VÊ o motivo (RN19/CA19)', async () => {
    await comoUsuario(db, { uid: REP })
    expect(await countContra()).toBe(1)
  })

  it('(g) admin VÊ o motivo', async () => {
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    expect(await countContra()).toBe(1)
  })

  it('INSERT direto de authenticated é NEGADO (só via RPC)', async () => {
    await comoUsuario(db, { uid: REP })
    expect(
      await negado(
        db.query(
          `insert into public.contraproposta(projeto_id,documento_id,motivo,criado_por)
           values ('${projetoId}','${docId}','Motivo válido.','${REP}')`,
        ),
      ),
    ).toBe(true)
  })
})
