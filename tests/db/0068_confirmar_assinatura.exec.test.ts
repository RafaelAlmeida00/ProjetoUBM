// @vitest-environment node
/**
 * T2.2 — RPC confirmar_assinatura (idempotente por origem)
 *
 * RED: função não existe / comportamentos não implementados.
 * GREEN: prova obrigatória antes do status; idempotência A e B; doc superado = no-op.
 *
 * spec: RN9/RN10/RN11/CA5/CA6/CA7/CA24/CA25 · RS8/RS9 · arch §4.4
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, negado } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

const HOST  = '00000000-0000-0000-0000-000000000001'
const REP   = '00000000-0000-0000-0000-000000000002'
const ALUNO = '00000000-0000-0000-0000-000000000003'
const ADM   = '00000000-0000-0000-0000-000000000004'
const CURSO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

let db: PGlite
let empresaId: string
let projetoId: string
let docId: string

async function seed() {
  await db.exec(`
    insert into auth.users(id,email) values
      ('${HOST}','host@ubm.br'),('${REP}','rep@ubm.br'),
      ('${ALUNO}','aluno@ubm.br'),('${ADM}','adm@ubm.br');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('EmpTeste','${REP}');
    update public.perfil set verificado_em=now() where user_id in ('${HOST}','${REP}','${ALUNO}');
    insert into public.curso(id,slug,nome) values ('${CURSO}','direito','Direito');
    insert into public.coordenador_curso(user_id,curso_id,aprovado) values ('${HOST}','${CURSO}',true);
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

  // enviar proposta (Caminho A — autentique)
  await comoUsuario(db, { uid: HOST })
  await db.query(`select public.enviar_proposta('${projetoId}','propostas/orig.pdf','autentique')`)

  await comoServiceRole(db)
  docId = (await db.query<{ id: string }>(`select id from public.documento_proposta where projeto_id='${projetoId}'`)).rows[0]!.id
  // Seta provedor_doc_id na assinatura (simula o que o adapter Autentique faria)
  await db.query(`update public.assinatura set provedor_doc_id='prov-001', status='enviada' where documento_id='${docId}'`)
}

async function status() {
  return (await db.query<{ s: string }>(`select status s from public.projeto where id='${projetoId}'`)).rows[0]!.s
}
async function assinaturaStatus() {
  return (await db.query<{ s: string }>(`select status s from public.assinatura where documento_id='${docId}'`)).rows[0]!.s
}

beforeEach(async () => { db = await novoBanco(); await seed() })
afterEach(async () => { await db.close() })

describe('0068b confirmar_assinatura', () => {
  it('CA5/CA6: Caminho A — confirma e avança projeto (prova+storage antes do status)', async () => {
    await comoServiceRole(db)
    await db.query(`select public.confirmar_assinatura('autentique','prov-001','propostas/assinado.pdf','{"hash_sha256":"abc"}'::jsonb)`)
    expect(await status()).toBe('proposta_aprovada')
    expect(await assinaturaStatus()).toBe('assinada')
    // verifica que o storage_path_assinado foi gravado
    const sp = (await db.query<{ p: string }>(`select storage_path_assinado p from public.documento_proposta where id='${docId}'`)).rows[0]!.p
    expect(sp).toBe('propostas/assinado.pdf')
  })

  it('CA6/RN11: storage_path NULL → raise, status NÃO muda', async () => {
    await comoServiceRole(db)
    expect(await negado(
      db.query(`select public.confirmar_assinatura('autentique','prov-001',null,'{"hash":"x"}'::jsonb)`)
    )).toBe(true)
    expect(await status()).toBe('proposta_em_analise')
  })

  it('CA7: reentrega Caminho A (mesmo provedor_doc_id) → no-op (idempotência)', async () => {
    await comoServiceRole(db)
    await db.query(`select public.confirmar_assinatura('autentique','prov-001','propostas/assinado.pdf','{"h":"1"}'::jsonb)`)
    // segunda chamada com mesmo provedor_doc_id deve ser no-op
    await db.query(`select public.confirmar_assinatura('autentique','prov-001','propostas/assinado2.pdf','{"h":"2"}'::jsonb)`)
    // status não muda de novo (ainda proposta_aprovada — ok)
    expect(await status()).toBe('proposta_aprovada')
    // storage path não foi sobrescrito pela 2ª chamada
    const sp = (await db.query<{ p: string }>(`select storage_path_assinado p from public.documento_proposta where id='${docId}'`)).rows[0]!.p
    expect(sp).toBe('propostas/assinado.pdf')
  })

  it('CA24/CA25: Caminho B (upload_livre) — confirma e avança projeto', async () => {
    // cria um novo doc com origem upload_livre
    await comoServiceRole(db)
    // Abre novo projeto para Caminho B
    const dorId2 = (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${ALUNO}','${empresaId}','em_moderacao','Dor B','Rep',true,'v1',now()) returning id`
    )).rows[0]!.id
    await db.query(`insert into public.dor_curso(dor_id,curso) values ('${dorId2}','direito')`)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor('${dorId2}','aprovar',null)`)
    await comoServiceRole(db)
    const pid2 = (await db.query<{ id: string }>(`select id from public.projeto where dor_id='${dorId2}'`)).rows[0]!.id

    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.indicar_se('${pid2}','coordenador',null)`)
    await comoUsuario(db, { uid: ALUNO })
    await db.query(`select public.indicar_se('${pid2}','aluno','q')`)
    await comoServiceRole(db)
    const ih2 = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid2}' and pessoa_id='${HOST}'`)).rows[0]!.id
    const ia2 = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid2}' and pessoa_id='${ALUNO}'`)).rows[0]!.id
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.eleger_host('${pid2}','${HOST}')`)
    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.fechar_equipe('${pid2}','${HOST}','[{"pessoa_id":"${HOST}","papel_projeto":"host","indicacao_id":"${ih2}"},{"pessoa_id":"${ALUNO}","papel_projeto":"aluno","indicacao_id":"${ia2}"}]')`)
    await db.query(`select public.avancar_projeto('${pid2}')`)
    await db.query(`select public.enviar_proposta('${pid2}','propostas/orig2.pdf','upload_livre')`)

    await comoServiceRole(db)
    const doc2 = (await db.query<{ id: string }>(`select id from public.documento_proposta where projeto_id='${pid2}'`)).rows[0]!.id

    // confirmar via upload_livre usando documento_id como chave
    await db.query(`select public.confirmar_assinatura('upload_livre','${doc2}','propostas/assinado2.pdf','{"origem":"upload"}'::jsonb)`)
    const st2 = (await db.query<{ s: string }>(`select status s from public.projeto where id='${pid2}'`)).rows[0]!.s
    expect(st2).toBe('proposta_aprovada')
  })

  it('CA25: 2º upload_livre no mesmo documento → no-op (idempotência B)', async () => {
    await comoServiceRole(db)
    // muda assinatura para upload_livre
    await db.query(`update public.assinatura set origem='upload_livre', provedor_doc_id=null where documento_id='${docId}'`)
    await db.query(`select public.confirmar_assinatura('upload_livre','${docId}','propostas/assinado.pdf','{"ok":true}'::jsonb)`)
    // 2ª chamada = no-op
    await db.query(`select public.confirmar_assinatura('upload_livre','${docId}','propostas/reenvio.pdf','{"ok":true}'::jsonb)`)
    // projeto ainda aprovado (sem dupla transição)
    expect(await status()).toBe('proposta_aprovada')
  })

  it('CA12: doc superado (pós-contraproposta) → no-op para upload_livre', async () => {
    await comoServiceRole(db)
    // marca documento como superado
    await db.query(`update public.documento_proposta set superado_em=now() where id='${docId}'`)
    await db.query(`update public.assinatura set origem='upload_livre', provedor_doc_id=null where documento_id='${docId}'`)
    // confirmar em doc superado → no-op
    await db.query(`select public.confirmar_assinatura('upload_livre','${docId}','propostas/assinado.pdf','{"ok":true}'::jsonb)`)
    // estado não avança
    expect(await status()).toBe('proposta_em_analise')
  })
})
