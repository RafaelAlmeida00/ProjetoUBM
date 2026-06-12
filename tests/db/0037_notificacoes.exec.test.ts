// @vitest-environment node
// T-O1.8 — triggers de notificação: abertura (coord via ponte curso) / fechar (membros+host) / avanço (equipe)
// RN3, RN28 · CA2, CA27 · RS12 (payload sem PII)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole } from './_pglite/harness'

const UID_ALUNO = '00000000-0000-0000-0000-000000000001'
const UID_COORD = '00000000-0000-0000-0000-000000000002' // coord 'direito' (curso da dor)
const UID_COORD_OUTRO = '00000000-0000-0000-0000-000000000003' // coord 'medicina_veterinaria' (não relacionado)
const UID_ADM = '00000000-0000-0000-0000-000000000004'
const C_DIR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const C_MED = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id,email) values
      ('${UID_ALUNO}','a@ubm.br'),('${UID_COORD}','c@ubm.br'),('${UID_COORD_OUTRO}','co@ubm.br'),('${UID_ADM}','adm@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Emp','${UID_ALUNO}');
    update public.perfil set verificado_em=now() where user_id in ('${UID_ALUNO}','${UID_COORD}','${UID_COORD_OUTRO}');
    insert into public.curso(id,slug,nome) values ('${C_DIR}','direito','Direito'),('${C_MED}','medicina_veterinaria','Med');
    insert into public.coordenador_curso(user_id,curso_id) values ('${UID_COORD}','${C_DIR}'),('${UID_COORD_OUTRO}','${C_MED}');
  `)
}

async function publicar(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  const eid = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
     values ('${UID_ALUNO}','${eid}','em_moderacao','Dor 037','Rep',true,'v1',now()) returning id`)).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id,curso) values ('${dorId}','direito')`)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}','aprovar',null)`)
  await comoServiceRole(db)
  return (await db.query<{ id: string }>(`select id from public.projeto where dor_id='${dorId}'`)).rows[0]!.id
}

const contar = async (db: import('@electric-sql/pglite').PGlite, uid: string, evento: string): Promise<number> => {
  await comoUsuario(db, { uid })
  return (await db.query<{ n: number }>(
    `select count(*)::int n from public.notificacao where destinatario_id='${uid}' and payload->>'evento'='${evento}'`)).rows[0]!.n
}

it('CA2/RN3: abertura notifica o coordenador do curso da dor (ponte curso), não o de curso alheio', async () => {
  const db = await novoBanco({ ate: '0037_triggers_notificacao.sql' })
  await seedBase(db); await publicar(db)
  expect(await contar(db, UID_COORD, 'projeto_aberto'), 'coord do curso notificado').toBeGreaterThanOrEqual(1)
  expect(await contar(db, UID_COORD_OUTRO, 'projeto_aberto'), 'coord de curso alheio NÃO notificado').toBe(0)
  await db.close()
})

it('CA27/RN28b: fechar equipe notifica membros (equipe_fechada) e host (eleito_host)', async () => {
  const db = await novoBanco({ ate: '0037_triggers_notificacao.sql' })
  await seedBase(db); const pid = await publicar(db)
  await comoUsuario(db, { uid: UID_ALUNO }); await db.query(`select public.indicar_se('${pid}','aluno',null)`)
  await comoUsuario(db, { uid: UID_COORD }); await db.query(`select public.indicar_se('${pid}','coordenador',null)`)
  await comoServiceRole(db)
  const ind = async (u: string) => (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${u}'`)).rows[0]!.id
  const iA = await ind(UID_ALUNO), iC = await ind(UID_COORD)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.fechar_equipe('${pid}','${UID_COORD}',
    '[{"pessoa_id":"${UID_COORD}","papel_projeto":"host","indicacao_id":"${iC}"},
      {"pessoa_id":"${UID_ALUNO}","papel_projeto":"aluno","indicacao_id":"${iA}"}]')`)
  expect(await contar(db, UID_ALUNO, 'equipe_fechada'), 'membro notificado').toBeGreaterThanOrEqual(1)
  expect(await contar(db, UID_COORD, 'eleito_host'), 'host notificado da eleição').toBeGreaterThanOrEqual(1)
  await db.close()
})

it('RN28c: avanço de estado notifica a equipe (projeto_avancou)', async () => {
  const db = await novoBanco({ ate: '0037_triggers_notificacao.sql' })
  await seedBase(db); const pid = await publicar(db)
  await comoUsuario(db, { uid: UID_COORD }); await db.query(`select public.indicar_se('${pid}','coordenador',null)`)
  await comoServiceRole(db)
  const iC = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${UID_COORD}'`)).rows[0]!.id
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.fechar_equipe('${pid}','${UID_COORD}','[{"pessoa_id":"${UID_COORD}","papel_projeto":"host","indicacao_id":"${iC}"}]')`)
  await comoUsuario(db, { uid: UID_COORD }); await db.query(`select public.avancar_projeto('${pid}')`)
  expect(await contar(db, UID_COORD, 'projeto_avancou'), 'equipe notificada do avanço').toBeGreaterThanOrEqual(1)
  await db.close()
})

it('RS12: payload de notificação não contém PII (nome/email)', async () => {
  const db = await novoBanco({ ate: '0037_triggers_notificacao.sql' })
  await seedBase(db); await publicar(db)
  await comoUsuario(db, { uid: UID_COORD })
  const rows = (await db.query<{ payload: Record<string, unknown> }>(
    `select payload from public.notificacao where destinatario_id='${UID_COORD}' and payload->>'evento'='projeto_aberto'`)).rows
  expect(rows.length).toBeGreaterThanOrEqual(1)
  const keys = Object.keys(rows[0]!.payload)
  expect(keys).not.toContain('nome'); expect(keys).not.toContain('email'); expect(keys).not.toContain('nome_publico')
  await db.close()
})
