// @vitest-environment node
// T-O1.5 — funcao_tarefa + policies por papel (DML direto sob RLS)
// RN21, RN22, RN26 · CA20, CA21, CA22 · RS1, RS8
import { describe, it, expect } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

const UID_ALUNO = '00000000-0000-0000-0000-000000000001'
const UID_COORD = '00000000-0000-0000-0000-000000000002' // host (coordenador do curso 'direito')
const UID_NAOMEMBRO = '00000000-0000-0000-0000-000000000003'
const UID_ADM = '00000000-0000-0000-0000-000000000004'
const CURSO_DIREITO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_ALUNO}','aluno@ubm.br'),
      ('${UID_COORD}','coord@ubm.br'),
      ('${UID_NAOMEMBRO}','fora@ubm.br'),
      ('${UID_ADM}','admin@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('EmpresaTeste','${UID_ALUNO}');
    update public.perfil set verificado_em = now()
      where user_id in ('${UID_ALUNO}','${UID_COORD}','${UID_NAOMEMBRO}');
    insert into public.curso(id, slug, nome) values ('${CURSO_DIREITO}','direito','Direito');
    insert into public.coordenador_curso(user_id, curso_id) values ('${UID_COORD}','${CURSO_DIREITO}');
  `)
}

/** Publica projeto (curso direito), indica aluno+coord e FECHA a equipe (coord=host, aluno=membro). */
async function setupEquipe(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  const eid = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id, empresa_id, status_dor, descricao, rep_nome, consentimento, consent_version, consent_at)
     values ('${UID_ALUNO}','${eid}','em_moderacao','Dor 034','Rep',true,'v1',now()) returning id`
  )).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}','direito')`)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}','aprovar',null)`)
  await comoServiceRole(db)
  const projetoId = (await db.query<{ id: string }>(`select id from public.projeto where dor_id='${dorId}'`)).rows[0]!.id

  await comoUsuario(db, { uid: UID_ALUNO }); await db.query(`select public.indicar_se('${projetoId}','aluno',null)`)
  await comoUsuario(db, { uid: UID_COORD }); await db.query(`select public.indicar_se('${projetoId}','coordenador',null)`)
  await comoServiceRole(db)
  const indAluno = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${projetoId}' and pessoa_id='${UID_ALUNO}'`)).rows[0]!.id
  const indCoord = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${projetoId}' and pessoa_id='${UID_COORD}'`)).rows[0]!.id
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.fechar_equipe('${projetoId}','${UID_COORD}',
    '[{"pessoa_id":"${UID_COORD}","papel_projeto":"host","indicacao_id":"${indCoord}"},
      {"pessoa_id":"${UID_ALUNO}","papel_projeto":"aluno","indicacao_id":"${indAluno}"}]')`)
  return projetoId
}

describe('0034 funcao_tarefa — policies por papel', () => {

  it('funcao_tarefa tem RLS enable+force (RS1)', async () => {
    const db = await novoBanco({ ate: '0034_funcao_tarefa.sql' })
    const r = (await db.query<{ rls: boolean; force: boolean }>(
      `select relrowsecurity rls, relforcerowsecurity force from pg_class c
       join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname='funcao_tarefa'`
    )).rows
    expect(r).toHaveLength(1); expect(r[0]!.rls).toBe(true); expect(r[0]!.force).toBe(true)
    await db.close()
  })

  it('funcao_tarefa tem colunas obrigatórias', async () => {
    const db = await novoBanco({ ate: '0034_funcao_tarefa.sql' })
    const cols = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema='public' and table_name='funcao_tarefa'`
    )).rows.map(r => r.column_name)
    for (const c of ['id','projeto_id','responsavel_id','titulo','descricao','concluida','created_at','deleted_at'])
      expect(cols).toContain(c)
    await db.close()
  })

  it('CA20/RN22: aluno cria e edita as PRÓPRIAS funções/tarefas', async () => {
    const db = await novoBanco({ ate: '0034_funcao_tarefa.sql' })
    await seedBase(db)
    const projetoId = await setupEquipe(db)

    await comoUsuario(db, { uid: UID_ALUNO })
    const id = (await db.query<{ id: string }>(
      `insert into public.funcao_tarefa(projeto_id, responsavel_id, titulo)
       values ('${projetoId}','${UID_ALUNO}','Minha tarefa') returning id`
    )).rows[0]!.id
    // edita a própria (conclui)
    await db.query(`update public.funcao_tarefa set concluida=true where id='${id}'`)
    await comoServiceRole(db)
    const done = (await db.query<{ concluida: boolean }>(`select concluida from public.funcao_tarefa where id='${id}'`)).rows[0]!.concluida
    expect(done).toBe(true)
    await db.close()
  })

  it('CA20/RN22: aluno NÃO edita a tarefa de OUTRO membro', async () => {
    const db = await novoBanco({ ate: '0034_funcao_tarefa.sql' })
    await seedBase(db)
    const projetoId = await setupEquipe(db)

    // host (coord) cria uma tarefa cujo responsável é o COORD
    await comoUsuario(db, { uid: UID_COORD })
    const idCoord = (await db.query<{ id: string }>(
      `insert into public.funcao_tarefa(projeto_id, responsavel_id, titulo)
       values ('${projetoId}','${UID_COORD}','Tarefa do coord') returning id`
    )).rows[0]!.id

    // aluno tenta editar a tarefa do coord → negado (0 linhas afetadas é OK; testamos que não muda)
    await comoUsuario(db, { uid: UID_ALUNO })
    await db.query(`update public.funcao_tarefa set concluida=true where id='${idCoord}'`).catch(() => {})
    await comoServiceRole(db)
    const c = (await db.query<{ concluida: boolean }>(`select concluida from public.funcao_tarefa where id='${idCoord}'`)).rows[0]!.concluida
    expect(c, 'aluno não pode concluir tarefa de outro membro').toBe(false)
    await db.close()
  })

  it('CA21/RN22: host/co-coordenador gerencia/reatribui as tarefas de TODOS', async () => {
    const db = await novoBanco({ ate: '0034_funcao_tarefa.sql' })
    await seedBase(db)
    const projetoId = await setupEquipe(db)

    // host cria tarefa para o ALUNO (responsável = aluno)
    await comoUsuario(db, { uid: UID_COORD })
    const id = (await db.query<{ id: string }>(
      `insert into public.funcao_tarefa(projeto_id, responsavel_id, titulo)
       values ('${projetoId}','${UID_ALUNO}','Tarefa atribuída pelo host') returning id`
    )).rows[0]!.id
    // host reatribui para si e conclui
    await db.query(`update public.funcao_tarefa set responsavel_id='${UID_COORD}', concluida=true where id='${id}'`)
    await comoServiceRole(db)
    const row = (await db.query<{ responsavel_id: string; concluida: boolean }>(
      `select responsavel_id::text, concluida from public.funcao_tarefa where id='${id}'`)).rows[0]!
    expect(row.responsavel_id).toBe(UID_COORD); expect(row.concluida).toBe(true)
    await db.close()
  })

  it('CA22/RN26: não-membro não vê nem cria funções/tarefas; anônimo negado', async () => {
    const db = await novoBanco({ ate: '0034_funcao_tarefa.sql' })
    await seedBase(db)
    const projetoId = await setupEquipe(db)

    await comoUsuario(db, { uid: UID_COORD })
    await db.query(`insert into public.funcao_tarefa(projeto_id, responsavel_id, titulo) values ('${projetoId}','${UID_ALUNO}','X')`)

    // não-membro: SELECT vê 0 linhas (RLS filtra)
    await comoUsuario(db, { uid: UID_NAOMEMBRO })
    const vis = (await db.query<{ n: number }>(`select count(*)::int n from public.funcao_tarefa where projeto_id='${projetoId}'`)).rows[0]!.n
    expect(vis, 'não-membro não enxerga tarefas do projeto').toBe(0)
    // não-membro INSERT negado (with check)
    expect(await negado(
      db.query(`insert into public.funcao_tarefa(projeto_id, responsavel_id, titulo) values ('${projetoId}','${UID_NAOMEMBRO}','Invasao')`)
    ), 'não-membro não cria tarefa').toBe(true)
    // anônimo SELECT negado/vazio
    await comoAnon(db)
    const anon = (await db.query<{ n: number }>(`select count(*)::int n from public.funcao_tarefa`)).rows[0]!.n
    expect(anon).toBe(0)
    await db.close()
  })

  it('trigger zzz_audit grava versão no INSERT de funcao_tarefa', async () => {
    const db = await novoBanco({ ate: '0034_funcao_tarefa.sql' })
    await seedBase(db)
    const projetoId = await setupEquipe(db)
    await comoUsuario(db, { uid: UID_COORD })
    await db.query(`insert into public.funcao_tarefa(projeto_id, responsavel_id, titulo) values ('${projetoId}','${UID_ALUNO}','Aud')`)
    await db.exec('reset role')
    const n = (await db.query<{ n: number }>(`select count(*)::int n from audit.record_version where tabela='public.funcao_tarefa'`)).rows[0]!.n
    expect(n).toBeGreaterThan(0)
    await db.close()
  })
})
