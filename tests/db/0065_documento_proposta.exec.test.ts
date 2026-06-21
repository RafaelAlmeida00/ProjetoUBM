// @vitest-environment node
/**
 * T1.2 — 0065_documento_proposta (E17)
 *
 * RED: tabela não existe (migração 0065 ainda não aplicada).
 * GREEN: tabela existe, RLS enable+force, visibilidade restrita conforme RN18/CA18.
 *
 * Papéis testados:
 *   - anon              → NEGADO (sem policy anon)
 *   - aluno da equipe   → NEGADO (não é host/co-coord/rep/admin)
 *   - terceiro autenticado → NEGADO
 *   - host (is_project_coordinator) → VÊ
 *   - representante da empresa (is_company_rep) → VÊ
 *   - admin → VÊ
 *   - INSERT direto de authenticated → NEGADO (só via RPC SECURITY DEFINER)
 *
 * spec: RN3/RN5/RN18/CA18 · RS1/RS2 · arch §4.1
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

async function seed() {
  // Fase 1: seed básico como superuser (padrão dos testes existentes)
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

  // vincula REP como representante
  await db.exec(
    `insert into public.membro_empresa(user_id,empresa_id,papel)
     values ('${REP}','${empresaId}','representante')`,
  )

  // Fase 2: dor + projeto via service_role (padrão dos testes)
  await comoServiceRole(db)
  const dorId = (
    await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${ALUNO}','${empresaId}','em_moderacao','Dor teste','Rep',true,'v1',now()) returning id`,
    )
  ).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id,curso) values ('${dorId}','direito')`)

  // modera → cria projeto
  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}','aprovar',null)`)

  await comoServiceRole(db)
  projetoId = (
    await db.query<{ id: string }>(
      `select id from public.projeto where dor_id='${dorId}'`,
    )
  ).rows[0]!.id

  // indicações + fechar equipe + avançar para aguardando_proposta
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

  // insere documento de proposta via service_role (simula o que a RPC fará)
  await comoServiceRole(db)
  docId = (
    await db.query<{ id: string }>(
      `insert into public.documento_proposta
         (projeto_id, tipo, empresa_id, enviado_por, storage_path_original, created_by)
       values
         ('${projetoId}','proposta','${empresaId}','${HOST}','propostas/original.pdf','${HOST}')
       returning id`,
    )
  ).rows[0]!.id
}

beforeEach(async () => {
  db = await novoBanco()
  await seed()
})
afterEach(async () => {
  await db.close()
})

async function countDoc() {
  return (
    await db.query<{ n: number }>(
      `select count(*)::int n from public.documento_proposta where id='${docId}'`,
    )
  ).rows[0]!.n
}

describe('0065 documento_proposta RLS (RN18/CA18 — RS1/RS2)', () => {
  it('tabela tem RLS habilitada e forçada (enable + force)', async () => {
    await comoServiceRole(db)
    const row = await db.query<{ rowsecurity: boolean; forcepolicy: boolean }>(
      `select relrowsecurity as rowsecurity, relforcerowsecurity as forcepolicy
       from pg_class
       where relname='documento_proposta' and relnamespace='public'::regnamespace`,
    )
    expect(row.rows[0]!.rowsecurity).toBe(true)
    expect(row.rows[0]!.forcepolicy).toBe(true)
  })

  it('RS1: anon NÃO vê o documento (deny-by-default, sem policy anon)', async () => {
    await comoAnon(db)
    expect(await countDoc()).toBe(0)
  })

  it('RS2: terceiro autenticado sem vínculo NÃO vê o documento', async () => {
    await comoUsuario(db, { uid: TERC })
    expect(await countDoc()).toBe(0)
  })

  it('RS2/RN18: aluno da equipe NÃO vê o documento (aluno não é coordinator)', async () => {
    await comoUsuario(db, { uid: ALUNO })
    expect(await countDoc()).toBe(0)
  })

  it('RS2/RN18: host (is_project_coordinator) VÊ o documento', async () => {
    await comoUsuario(db, { uid: HOST })
    expect(await countDoc()).toBe(1)
  })

  it('RS2/RN18: representante da empresa (is_company_rep) VÊ o documento', async () => {
    await comoUsuario(db, { uid: REP })
    expect(await countDoc()).toBe(1)
  })

  it('admin VÊ o documento', async () => {
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    expect(await countDoc()).toBe(1)
  })

  it('RS1: INSERT direto de authenticated é NEGADO (sem policy de escrita — só via RPC)', async () => {
    await comoUsuario(db, { uid: HOST })
    expect(
      await negado(
        db.query(
          `insert into public.documento_proposta
             (projeto_id, tipo, empresa_id, enviado_por, storage_path_original, created_by)
           values
             ('${projetoId}','proposta','${empresaId}','${HOST}','propostas/novo.pdf','${HOST}')`,
        ),
      ),
    ).toBe(true)
  })
})
