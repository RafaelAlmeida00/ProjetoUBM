// @vitest-environment node
// T-O1.6 — RPCs de transição: avancar_projeto (host) / trocar_host (admin) / override_transicao (admin)
// RN14, RN15, RN16, RN17, RN19 · CA13, CA14, CA15, CA16, CA18 · RS5, RS6
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

const UID_ALUNO = '00000000-0000-0000-0000-000000000001'
const UID_COORD1 = '00000000-0000-0000-0000-000000000002' // host inicial (coord 'direito')
const UID_COORD2 = '00000000-0000-0000-0000-000000000003' // co-coordenador (coord 'medicina_veterinaria')
const UID_ADM = '00000000-0000-0000-0000-000000000004'
const C_DIR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const C_MED = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id,email) values
      ('${UID_ALUNO}','a@ubm.br'),('${UID_COORD1}','c1@ubm.br'),('${UID_COORD2}','c2@ubm.br'),('${UID_ADM}','adm@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Emp','${UID_ALUNO}');
    update public.perfil set verificado_em=now() where user_id in ('${UID_ALUNO}','${UID_COORD1}','${UID_COORD2}');
    insert into public.curso(id,slug,nome) values ('${C_DIR}','direito','Direito'),('${C_MED}','medicina_veterinaria','Med Vet');
    insert into public.coordenador_curso(user_id,curso_id) values ('${UID_COORD1}','${C_DIR}'),('${UID_COORD2}','${C_MED}');
  `)
}

/** Projeto aprovado: host=coord1, co=coord2, membro=aluno. Retorna projetoId. */
async function setupAprovado(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  const eid = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
     values ('${UID_ALUNO}','${eid}','em_moderacao','Dor 035','Rep',true,'v1',now()) returning id`)).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id,curso) values ('${dorId}','direito')`)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}','aprovar',null)`)
  await comoServiceRole(db)
  const pid = (await db.query<{ id: string }>(`select id from public.projeto where dor_id='${dorId}'`)).rows[0]!.id
  for (const [uid, papel] of [[UID_ALUNO,'aluno'],[UID_COORD1,'coordenador'],[UID_COORD2,'coordenador']] as const) {
    await comoUsuario(db, { uid }); await db.query(`select public.indicar_se('${pid}','${papel}',null)`)
  }
  await comoServiceRole(db)
  const ind = async (u: string) => (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${u}'`)).rows[0]!.id
  const iA = await ind(UID_ALUNO), i1 = await ind(UID_COORD1), i2 = await ind(UID_COORD2)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.fechar_equipe('${pid}','${UID_COORD1}',
    '[{"pessoa_id":"${UID_COORD1}","papel_projeto":"host","indicacao_id":"${i1}"},
      {"pessoa_id":"${UID_COORD2}","papel_projeto":"co_coordenador","indicacao_id":"${i2}"},
      {"pessoa_id":"${UID_ALUNO}","papel_projeto":"aluno","indicacao_id":"${iA}"}]')`)
  return pid
}

async function status(db: import('@electric-sql/pglite').PGlite, pid: string): Promise<string> {
  await comoServiceRole(db)
  return (await db.query<{ s: string }>(`select status::text s from public.projeto where id='${pid}'`)).rows[0]!.s
}

describe('0035 transicao — avancar_projeto / trocar_host / override_transicao', () => {

  it('projeto_update_host policy existe', async () => {
    const db = await novoBanco({ ate: '0035_rpcs_transicao.sql' })
    const r = (await db.query<{ n: number }>(
      `select count(*)::int n from pg_policies where schemaname='public' and tablename='projeto' and policyname='projeto_update_host'`)).rows[0]!.n
    expect(r).toBe(1); await db.close()
  })

  it('CA14/RN17: só o host avança aprovado→aguardando_proposta; co/aluno negados', async () => {
    const db = await novoBanco({ ate: '0035_rpcs_transicao.sql' })
    await seedBase(db); const pid = await setupAprovado(db)

    // co_coordenador tenta avançar → negado (guarda)
    await comoUsuario(db, { uid: UID_COORD2 })
    expect(await negado(db.query(`select public.avancar_projeto('${pid}')`)), 'co não avança').toBe(true)
    // aluno tenta → negado
    await comoUsuario(db, { uid: UID_ALUNO })
    expect(await negado(db.query(`select public.avancar_projeto('${pid}')`)), 'aluno não avança').toBe(true)
    // host avança → ok
    await comoUsuario(db, { uid: UID_COORD1 })
    await db.query(`select public.avancar_projeto('${pid}')`)
    expect(await status(db, pid)).toBe('aguardando_proposta')
    await db.close()
  })

  it('CA17: avançar gera evento de timeline (aprovado→aguardando_proposta)', async () => {
    const db = await novoBanco({ ate: '0035_rpcs_transicao.sql' })
    await seedBase(db); const pid = await setupAprovado(db)
    await comoUsuario(db, { uid: UID_COORD1 }); await db.query(`select public.avancar_projeto('${pid}')`)
    await comoServiceRole(db)
    const ev = (await db.query<{ de: string; para: string }>(
      `select de_status::text de, para_status::text para from public.status_evento
       where projeto_id='${pid}' and para_status='aguardando_proposta'`)).rows
    expect(ev).toHaveLength(1); expect(ev[0]!.de).toBe('aprovado')
    await db.close()
  })

  it('CA13/RN14/RS5: só admin troca o host; mantém exatamente 1 host', async () => {
    const db = await novoBanco({ ate: '0035_rpcs_transicao.sql' })
    await seedBase(db); const pid = await setupAprovado(db)

    // coord/aluno não trocam host
    await comoUsuario(db, { uid: UID_COORD1 })
    expect(await negado(db.query(`select public.trocar_host('${pid}','${UID_COORD2}')`)), 'coord não troca host').toBe(true)
    await comoUsuario(db, { uid: UID_ALUNO })
    expect(await negado(db.query(`select public.trocar_host('${pid}','${UID_COORD2}')`)), 'aluno não troca host').toBe(true)

    // admin troca host: coord1→co_coordenador, coord2→host
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.trocar_host('${pid}','${UID_COORD2}')`)
    await comoServiceRole(db)
    const hosts = (await db.query<{ pessoa_id: string }>(
      `select pessoa_id::text from public.membro_equipe where projeto_id='${pid}' and papel_projeto='host' and deleted_at is null`)).rows
    expect(hosts, 'exatamente 1 host').toHaveLength(1)
    expect(hosts[0]!.pessoa_id).toBe(UID_COORD2)
    const proj = (await db.query<{ h: string }>(`select host_coordenador_id::text h from public.projeto where id='${pid}'`)).rows[0]!
    expect(proj.h).toBe(UID_COORD2)
    await db.close()
  })

  it('CA18/RN19: só admin faz override_transicao e o evento grava o motivo', async () => {
    const db = await novoBanco({ ate: '0035_rpcs_transicao.sql' })
    await seedBase(db); const pid = await setupAprovado(db)

    // coord não faz override
    await comoUsuario(db, { uid: UID_COORD1 })
    expect(await negado(db.query(`select public.override_transicao('${pid}','aguardando_proposta','x')`)), 'coord não override').toBe(true)

    // admin override aprovado→aguardando_proposta com motivo
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.override_transicao('${pid}','aguardando_proposta','host ausente — destravado pelo admin')`)
    expect(await status(db, pid)).toBe('aguardando_proposta')
    await comoServiceRole(db)
    const ev = (await db.query<{ motivo: string | null }>(
      `select motivo from public.status_evento where projeto_id='${pid}' and para_status='aguardando_proposta' order by ocorrido_em desc limit 1`)).rows[0]!
    expect(ev.motivo).toContain('destravado pelo admin')
    await db.close()
  })
})
