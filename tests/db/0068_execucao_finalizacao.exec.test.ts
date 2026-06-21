// @vitest-environment node
/**
 * T2.4 — RPCs iniciar_execucao + finalizar_projeto
 *
 * RED: funções não existem.
 * GREEN: só host; proposta_aprovada→em_execucao→finalizado; pular etapa negado.
 *
 * spec: RN18a/RN18b/CA16/CA17 · RS4 · arch §3.6
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

  // enviar proposta e confirmar assinatura para chegar a proposta_aprovada
  await comoUsuario(db, { uid: HOST })
  await db.query(`select public.enviar_proposta('${projetoId}','propostas/orig.pdf','autentique')`)
  await comoServiceRole(db)
  const docId = (await db.query<{ id: string }>(`select id from public.documento_proposta where projeto_id='${projetoId}'`)).rows[0]!.id
  await db.query(`update public.assinatura set provedor_doc_id='prov-001', status='enviada' where documento_id='${docId}'`)
  await db.query(`select public.confirmar_assinatura('autentique','prov-001','propostas/assinado.pdf','{"h":"x"}'::jsonb)`)
}

async function status() {
  return (await db.query<{ s: string }>(`select status s from public.projeto where id='${projetoId}'`)).rows[0]!.s
}

beforeEach(async () => { db = await novoBanco(); await seed() })
afterEach(async () => { await db.close() })

describe('0068d iniciar_execucao + finalizar_projeto', () => {
  it('CA16: host inicia execução (proposta_aprovada → em_execucao)', async () => {
    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.iniciar_execucao('${projetoId}')`)
    expect(await status()).toBe('em_execucao')
  })

  it('CA17: host finaliza projeto (em_execucao → finalizado)', async () => {
    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.iniciar_execucao('${projetoId}')`)
    await db.query(`select public.finalizar_projeto('${projetoId}')`)
    expect(await status()).toBe('finalizado')
  })

  it('CA16: rep/aluno/co-coord NÃO pode iniciar execução', async () => {
    await comoUsuario(db, { uid: REP })
    expect(await negado(db.query(`select public.iniciar_execucao('${projetoId}')`))).toBe(true)
    await comoUsuario(db, { uid: ALUNO })
    expect(await negado(db.query(`select public.iniciar_execucao('${projetoId}')`))).toBe(true)
  })

  it('CA17: pular etapa (proposta_aprovada → finalizado) é NEGADO', async () => {
    await comoUsuario(db, { uid: HOST })
    expect(await negado(db.query(`select public.finalizar_projeto('${projetoId}')`))).toBe(true)
    expect(await status()).toBe('proposta_aprovada')
  })

  it('CA17: pular etapa (em_execucao → proposta_aprovada/aguardando) é NEGADO', async () => {
    await comoUsuario(db, { uid: HOST })
    await db.query(`select public.iniciar_execucao('${projetoId}')`)
    // só admin pode fazer override para trás
    await comoUsuario(db, { uid: ALUNO })
    expect(await negado(db.query(`select public.iniciar_execucao('${projetoId}')`))).toBe(true)
  })

  it('CA17: finalizar sem iniciar execução é NEGADO (estado incorreto)', async () => {
    await comoUsuario(db, { uid: HOST })
    // projeto ainda em proposta_aprovada, não em_execucao
    expect(await negado(db.query(`select public.finalizar_projeto('${projetoId}')`))).toBe(true)
  })
})
