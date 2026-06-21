// @vitest-environment node
/**
 * T2.3 — RPC contrapropor_proposta
 *
 * RED: função não existe.
 * GREEN: representante + motivo + estado proposta_em_analise → cancela assinatura + superado_em
 *        + insere contraproposta + → aguardando_proposta; alerta em ≥3 rodadas.
 *
 * spec: RN14/RN15/RN16/RN16b/CA11/CA12/CA14 · RS2 · arch §3.4
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
}

async function statusProjeto() {
  return (await db.query<{ s: string }>(`select status s from public.projeto where id='${projetoId}'`)).rows[0]!.s
}

// Ciclo completo: envia proposta e retorna docId
async function enviarProposta(): Promise<string> {
  await comoUsuario(db, { uid: HOST })
  await db.query(`select public.enviar_proposta('${projetoId}','propostas/orig.pdf','autentique')`)
  await comoServiceRole(db)
  return (await db.query<{ id: string }>(`select id from public.documento_proposta where projeto_id='${projetoId}' and superado_em is null order by created_at desc limit 1`)).rows[0]!.id
}

beforeEach(async () => { db = await novoBanco(); await seed() })
afterEach(async () => { await db.close() })

describe('0068c contrapropor_proposta', () => {
  it('CA11: rep + motivo → volta a aguardando_proposta', async () => {
    await enviarProposta()
    await comoUsuario(db, { uid: REP })
    await db.query(`select public.contrapropor_proposta('${projetoId}','Preço elevado.')`)
    expect(await statusProjeto()).toBe('aguardando_proposta')
  })

  it('CA11: insere registro em contraproposta', async () => {
    const docId = await enviarProposta()
    await comoUsuario(db, { uid: REP })
    await db.query(`select public.contrapropor_proposta('${projetoId}','Revisar o escopo.')`)
    await comoServiceRole(db)
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.contraproposta where projeto_id='${projetoId}' and documento_id='${docId}'`)).rows[0]!.n
    expect(n).toBe(1)
  })

  it('CA12: documento fica marcado como superado_em após contraproposta', async () => {
    const docId = await enviarProposta()
    await comoUsuario(db, { uid: REP })
    await db.query(`select public.contrapropor_proposta('${projetoId}','Revisar.')`)
    await comoServiceRole(db)
    const sup = (await db.query<{ s: string | null }>(`select superado_em::text s from public.documento_proposta where id='${docId}'`)).rows[0]!.s
    expect(sup).not.toBeNull()
  })

  it('CA12: assinatura fica cancelada após contraproposta', async () => {
    const docId = await enviarProposta()
    await comoUsuario(db, { uid: REP })
    await db.query(`select public.contrapropor_proposta('${projetoId}','Revisar.')`)
    await comoServiceRole(db)
    const st = (await db.query<{ s: string }>(`select status s from public.assinatura where documento_id='${docId}'`)).rows[0]!.s
    expect(st).toBe('cancelada')
  })

  it('CA11: motivo vazio é NEGADO', async () => {
    await enviarProposta()
    await comoUsuario(db, { uid: REP })
    expect(await negado(db.query(`select public.contrapropor_proposta('${projetoId}','')`))).toBe(true)
  })

  it('CA11: host/aluno/admin NÃO pode contrapropor', async () => {
    await enviarProposta()
    await comoUsuario(db, { uid: HOST })
    expect(await negado(db.query(`select public.contrapropor_proposta('${projetoId}','Motivo.')`))).toBe(true)
    await comoUsuario(db, { uid: ALUNO })
    expect(await negado(db.query(`select public.contrapropor_proposta('${projetoId}','Motivo.')`))).toBe(true)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    expect(await negado(db.query(`select public.contrapropor_proposta('${projetoId}','Motivo.')`))).toBe(true)
  })

  it('CA11: fora de proposta_em_analise é NEGADO', async () => {
    // sem enviar proposta (projeto está em aguardando_proposta)
    await comoUsuario(db, { uid: REP })
    expect(await negado(db.query(`select public.contrapropor_proposta('${projetoId}','Motivo.')`))).toBe(true)
  })

  it('CA14: ≥3 rodadas sinaliza alerta_negociacao no projeto', async () => {
    for (let i = 0; i < 3; i++) {
      await enviarProposta()
      await comoUsuario(db, { uid: REP })
      await db.query(`select public.contrapropor_proposta('${projetoId}','Rodada ${i + 1}.')`)
    }
    await comoServiceRole(db)
    const alerta = (await db.query<{ a: boolean }>(`select alerta_negociacao a from public.projeto where id='${projetoId}'`)).rows[0]!.a
    expect(alerta).toBe(true)
  })
})
