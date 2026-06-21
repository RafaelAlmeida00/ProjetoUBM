// @vitest-environment node
/**
 * T2.1 — RPC enviar_proposta
 *
 * RED: função não existe.
 * GREEN: valida host+verificado+estado; cria documento+assinatura; → proposta_em_analise.
 *
 * spec: RN1/RN2/RN3/RN4/CA1/CA2/CA3/CA9 · RS3/RS5 · arch §3.1
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, comoAnon, negado } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

const HOST  = '00000000-0000-0000-0000-000000000001'
const REP   = '00000000-0000-0000-0000-000000000002'
const ALUNO = '00000000-0000-0000-0000-000000000003'
const ADM   = '00000000-0000-0000-0000-000000000004'
const CURSO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

let db: PGlite
let empresaId: string
let projetoId: string

async function seed() {
  await db.exec(`
    insert into auth.users(id,email) values
      ('${HOST}','host@ubm.br'),
      ('${REP}','rep@ubm.br'),
      ('${ALUNO}','aluno@ubm.br'),
      ('${ADM}','adm@ubm.br');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('EmpTeste','${REP}');
    update public.perfil set verificado_em=now()
      where user_id in ('${HOST}','${REP}','${ALUNO}');
    insert into public.curso(id,slug,nome) values ('${CURSO}','direito','Direito');
    insert into public.coordenador_curso(user_id,curso_id,aprovado)
      values ('${HOST}','${CURSO}',true);
  `)

  empresaId = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  await db.exec(`insert into public.membro_empresa(user_id,empresa_id,papel) values ('${REP}','${empresaId}','representante')`)

  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
     values ('${ALUNO}','${empresaId}','em_moderacao','Dor','Rep',true,'v1',now()) returning id`
  )).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id,curso) values ('${dorId}','direito')`)

  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}','aprovar',null)`)

  await comoServiceRole(db)
  projetoId = (await db.query<{ id: string }>(`select id from public.projeto where dor_id='${dorId}'`)).rows[0]!.id

  await comoUsuario(db, { uid: HOST })
  await db.query(`select public.indicar_se('${projetoId}','coordenador',null)`)
  await comoUsuario(db, { uid: ALUNO })
  await db.query(`select public.indicar_se('${projetoId}','aluno','quero')`)

  await comoServiceRole(db)
  const indHost  = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${projetoId}' and pessoa_id='${HOST}'`)).rows[0]!.id
  const indAluno = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${projetoId}' and pessoa_id='${ALUNO}'`)).rows[0]!.id

  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.eleger_host('${projetoId}','${HOST}')`)
  await comoUsuario(db, { uid: HOST })
  await db.query(`select public.fechar_equipe('${projetoId}','${HOST}','[
    {"pessoa_id":"${HOST}","papel_projeto":"host","indicacao_id":"${indHost}"},
    {"pessoa_id":"${ALUNO}","papel_projeto":"aluno","indicacao_id":"${indAluno}"}
  ]')`)
  await db.query(`select public.avancar_projeto('${projetoId}')`)
}

async function status() {
  return (await db.query<{ s: string }>(`select status s from public.projeto where id='${projetoId}'`)).rows[0]!.s
}

beforeEach(async () => { db = await novoBanco(); await seed() })
afterEach(async () => { await db.close() })

describe('0068a enviar_proposta', () => {
  it('CA1: host verificado em aguardando_proposta → proposta_em_analise', async () => {
    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.enviar_proposta('${projetoId}','propostas/orig.pdf','autentique')`)
    expect(await status()).toBe('proposta_em_analise')
  })

  it('CA1: cria documento_proposta e assinatura', async () => {
    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.enviar_proposta('${projetoId}','propostas/orig.pdf','autentique')`)
    await comoServiceRole(db)
    const nd = (await db.query<{ n: number }>(`select count(*)::int n from public.documento_proposta where projeto_id='${projetoId}'`)).rows[0]!.n
    expect(nd).toBe(1)
    const na = (await db.query<{ n: number }>(`select count(*)::int n from public.assinatura a join public.documento_proposta d on d.id=a.documento_id where d.projeto_id='${projetoId}'`)).rows[0]!.n
    expect(na).toBe(1)
  })

  it('CA9: signatário = representante (is_company_rep), não o host nem admin', async () => {
    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.enviar_proposta('${projetoId}','propostas/orig.pdf','autentique')`)
    await comoServiceRole(db)
    const sig = (await db.query<{ signatario_id: string }>(
      `select a.signatario_id from public.assinatura a join public.documento_proposta d on d.id=a.documento_id where d.projeto_id='${projetoId}'`
    )).rows[0]!.signatario_id
    expect(sig).toBe(REP)
  })

  it('CA1: empresa_id do documento = empresa da dor', async () => {
    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.enviar_proposta('${projetoId}','propostas/orig.pdf','autentique')`)
    await comoServiceRole(db)
    const eid = (await db.query<{ empresa_id: string }>(
      `select empresa_id from public.documento_proposta where projeto_id='${projetoId}'`
    )).rows[0]!.empresa_id
    expect(eid).toBe(empresaId)
  })

  it('CA2: fora de aguardando_proposta é NEGADO', async () => {
    // volta ao estado em_analise via override admin
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.override_transicao('${projetoId}','em_analise','teste CA2')`)
    await comoUsuario(db, { uid: HOST })
    expect(await negado(db.query(`select public.enviar_proposta('${projetoId}','p.pdf','autentique')`))).toBe(true)
  })

  it('CA3: host NÃO verificado é NEGADO', async () => {
    // remove verificação do HOST via service_role (não contamina o role)
    await comoServiceRole(db)
    await db.query(`update public.perfil set verificado_em=null where user_id='${HOST}'`)
    await comoUsuario(db, { uid: HOST })
    expect(await negado(db.query(`select public.enviar_proposta('${projetoId}','p.pdf','autentique')`))).toBe(true)
  })

  it('CA1: rep/aluno/terceiro/anon NÃO pode enviar proposta', async () => {
    await comoUsuario(db, { uid: REP })
    expect(await negado(db.query(`select public.enviar_proposta('${projetoId}','p.pdf','autentique')`))).toBe(true)
    await comoUsuario(db, { uid: ALUNO })
    expect(await negado(db.query(`select public.enviar_proposta('${projetoId}','p.pdf','autentique')`))).toBe(true)
    await comoAnon(db)
    expect(await negado(db.query(`select public.enviar_proposta('${projetoId}','p.pdf','autentique')`))).toBe(true)
  })

  it('0075 CA7: persiste provedor_doc_id + link_assinatura + status=enviada (Caminho A)', async () => {
    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.enviar_proposta('${projetoId}','propostas/orig.pdf','autentique','aut-doc-xyz','https://aut/sign/xyz')`)
    await comoServiceRole(db)
    const r = (await db.query<{ provedor_doc_id: string; link_assinatura: string; status: string }>(
      `select a.provedor_doc_id, a.link_assinatura, a.status from public.assinatura a
         join public.documento_proposta d on d.id=a.documento_id where d.projeto_id='${projetoId}'`
    )).rows[0]!
    expect(r.provedor_doc_id).toBe('aut-doc-xyz')
    expect(r.link_assinatura).toBe('https://aut/sign/xyz')
    expect(r.status).toBe('enviada')
  })

  it('0075 compat: chamada 3-arg ainda funciona (status pendente, provedor null)', async () => {
    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.enviar_proposta('${projetoId}','propostas/orig.pdf','autentique')`)
    await comoServiceRole(db)
    const r = (await db.query<{ status: string; provedor_doc_id: string | null }>(
      `select a.status, a.provedor_doc_id from public.assinatura a
         join public.documento_proposta d on d.id=a.documento_id where d.projeto_id='${projetoId}'`
    )).rows[0]!
    expect(r.status).toBe('pendente')
    expect(r.provedor_doc_id).toBeNull()
  })
})

describe('0075 obter_signatario_proposta', () => {
  it('host obtém nome+email do representante da empresa', async () => {
    await comoUsuario(db, { uid: HOST })
    const r = (await db.query<{ nome: string; email: string }>(
      `select * from public.obter_signatario_proposta('${projetoId}')`
    )).rows[0]!
    expect(r.email).toBe('rep@ubm.br')
  })

  it('admin também obtém o signatário', async () => {
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    const r = (await db.query<{ email: string }>(
      `select * from public.obter_signatario_proposta('${projetoId}')`
    )).rows
    expect(r[0]?.email).toBe('rep@ubm.br')
  })

  it('rep/aluno/anon NÃO podem obter o signatário (RN18)', async () => {
    await comoUsuario(db, { uid: REP })
    expect(await negado(db.query(`select * from public.obter_signatario_proposta('${projetoId}')`))).toBe(true)
    await comoUsuario(db, { uid: ALUNO })
    expect(await negado(db.query(`select * from public.obter_signatario_proposta('${projetoId}')`))).toBe(true)
    await comoAnon(db)
    expect(await negado(db.query(`select * from public.obter_signatario_proposta('${projetoId}')`))).toBe(true)
  })
})
