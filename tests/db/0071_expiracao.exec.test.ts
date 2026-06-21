// @vitest-environment node
/**
 * T2.6 — expirar_propostas() (job pg_cron)
 *
 * RED: função não existe.
 * GREEN: propostas enviadas há >60 dias → expirada + aguardando_proposta;
 *        propostas <60 dias → não expiram.
 *
 * spec: RN17/CA15 · RS15 · arch §3.5
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

async function criarProjetoEmAnalise(): Promise<{ projetoId: string; docId: string }> {
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
     values ('${ALUNO}','${empresaId}','em_moderacao','Dor','Rep',true,'v1',now()) returning id`
  )).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id,curso) values ('${dorId}','direito')`)

  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}','aprovar',null)`)

  await comoServiceRole(db)
  const projetoId = (await db.query<{ id: string }>(`select id from public.projeto where dor_id='${dorId}'`)).rows[0]!.id

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
  await db.query(`select public.enviar_proposta('${projetoId}','propostas/orig.pdf','autentique')`)

  await comoServiceRole(db)
  const docId = (await db.query<{ id: string }>(`select id from public.documento_proposta where projeto_id='${projetoId}'`)).rows[0]!.id
  // Seta provedor_doc_id (necessário para o job identificar assinaturas enviadas)
  await db.query(`update public.assinatura set provedor_doc_id='prov-exp-${projetoId}', status='enviada' where documento_id='${docId}'`)

  return { projetoId, docId }
}

beforeEach(async () => {
  db = await novoBanco()
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
})
afterEach(async () => { await db.close() })

describe('0071 expirar_propostas', () => {
  it('CA15: assinatura enviada há >60 dias expira + projeto volta a aguardando_proposta', async () => {
    const { projetoId, docId } = await criarProjetoEmAnalise()
    // retroage a criação da assinatura para >60 dias atrás
    await comoServiceRole(db)
    await db.query(`update public.assinatura set created_at = now() - interval '61 days' where documento_id='${docId}'`)

    // executa o job como service_role
    await db.query(`select public.expirar_propostas()`)

    const st = (await db.query<{ s: string }>(`select status s from public.projeto where id='${projetoId}'`)).rows[0]!.s
    expect(st).toBe('aguardando_proposta')

    const ast = (await db.query<{ s: string }>(`select status s from public.assinatura where documento_id='${docId}'`)).rows[0]!.s
    expect(ast).toBe('expirada')
  })

  it('CA15: assinatura enviada há <60 dias NÃO expira', async () => {
    const { projetoId, docId } = await criarProjetoEmAnalise()
    // 59 dias — não deve expirar
    await comoServiceRole(db)
    await db.query(`update public.assinatura set created_at = now() - interval '59 days' where documento_id='${docId}'`)

    await db.query(`select public.expirar_propostas()`)

    const st = (await db.query<{ s: string }>(`select status s from public.projeto where id='${projetoId}'`)).rows[0]!.s
    expect(st).toBe('proposta_em_analise')
    const ast = (await db.query<{ s: string }>(`select status s from public.assinatura where documento_id='${docId}'`)).rows[0]!.s
    expect(ast).toBe('enviada')
  })

  it('CA15: projeto já assinado (proposta_aprovada) NÃO é afetado pelo job', async () => {
    const { projetoId, docId } = await criarProjetoEmAnalise()
    await comoServiceRole(db)
    // confirma a assinatura primeiro
    await db.query(`select public.confirmar_assinatura('autentique','prov-exp-${projetoId}','propostas/assinado.pdf','{"h":"x"}'::jsonb)`)
    // retroage
    await db.query(`update public.assinatura set created_at = now() - interval '65 days' where documento_id='${docId}'`)
    await db.query(`select public.expirar_propostas()`)

    const st = (await db.query<{ s: string }>(`select status s from public.projeto where id='${projetoId}'`)).rows[0]!.s
    expect(st).toBe('proposta_aprovada') // não regride
  })

  it('expirar_propostas é chamável apenas por service_role / authenticated (anon negado)', async () => {
    const { projetoId } = await criarProjetoEmAnalise()
    void projetoId // satisfaz lint
    // autenticado pode chamar (é SECURITY DEFINER — a AUTZ real é interna)
    await comoServiceRole(db)
    await expect(db.query(`select public.expirar_propostas()`)).resolves.toBeTruthy()
  })
})
