// @vitest-environment node
/**
 * 0062 — editar_equipe: edição IN-PLACE da equipe em qualquer estágio >= aprovado
 * (Equipe Aprovada), por admin OU host, SEM reverter o status do projeto.
 * Recompõe a partir de indicações ATIVAS (RN11/RN13). Troca de host continua
 * sendo exclusiva do admin (trocar_host) — editar_equipe rejeita troca de host.
 *
 * Decisão do cliente (2026-06-21): rearranjo de equipe (alunos saem, co-coord muda)
 * acontece na vida real em qualquer etapa após a equipe aprovada, sem voltar o status.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, negado } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

const ALUNO = '00000000-0000-0000-0000-000000000001'
const COORD = '00000000-0000-0000-0000-000000000002'
const ALUNO2 = '00000000-0000-0000-0000-000000000003'
const ADM = '00000000-0000-0000-0000-000000000004'
const C_DIR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

let db: PGlite
let pid: string
let indAluno: string
let indAluno2: string
let indCoord: string

async function seed() {
  await db.exec(`
    insert into auth.users(id,email) values
      ('${ALUNO}','a@ubm.br'),('${COORD}','c@ubm.br'),('${ALUNO2}','a2@ubm.br'),('${ADM}','adm@ubm.br');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Emp','${ALUNO}');
    update public.perfil set verificado_em=now() where user_id in ('${ALUNO}','${COORD}','${ALUNO2}');
    insert into public.curso(id,slug,nome) values ('${C_DIR}','direito','Direito');
    insert into public.coordenador_curso(user_id,curso_id,aprovado) values ('${COORD}','${C_DIR}',true);
  `)
  const eid = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
     values ('${ALUNO}','${eid}','em_moderacao','Dor','Rep',true,'v1',now()) returning id`)).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id,curso) values ('${dorId}','direito')`)
  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}','aprovar',null)`)
  await comoServiceRole(db)
  pid = (await db.query<{ id: string }>(`select id from public.projeto where dor_id='${dorId}'`)).rows[0]!.id
  await comoUsuario(db, { uid: ALUNO });  await db.query(`select public.indicar_se('${pid}','aluno','quero')`)
  await comoUsuario(db, { uid: ALUNO2 }); await db.query(`select public.indicar_se('${pid}','aluno','eu tambem')`)
  await comoUsuario(db, { uid: COORD });  await db.query(`select public.indicar_se('${pid}','coordenador',null)`)
  await comoServiceRole(db)
  indAluno  = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${ALUNO}'`)).rows[0]!.id
  indAluno2 = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${ALUNO2}'`)).rows[0]!.id
  indCoord  = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${COORD}'`)).rows[0]!.id
}

// fecha equipe (host COORD + ALUNO) e avança aprovado -> aguardando_proposta
async function fecharEAvancar() {
  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.eleger_host('${pid}','${COORD}')`)
  await comoUsuario(db, { uid: COORD })
  await db.query(`select public.fechar_equipe('${pid}','${COORD}','[
    {"pessoa_id":"${COORD}","papel_projeto":"host","indicacao_id":"${indCoord}"},
    {"pessoa_id":"${ALUNO}","papel_projeto":"aluno","indicacao_id":"${indAluno}"}]')`)
  await db.query(`select public.avancar_projeto('${pid}')`) // host avança
}

async function status(): Promise<string> {
  return (await db.query<{ status: string }>(`select status from public.projeto where id='${pid}'`)).rows[0]!.status
}
async function membrosAtivos(): Promise<number> {
  return (await db.query<{ n: number }>(
    `select count(*)::int n from public.membro_equipe where projeto_id='${pid}' and deleted_at is null`)).rows[0]!.n
}
const ADD_ALUNO2 = () => `'[
  {"pessoa_id":"${COORD}","papel_projeto":"host","indicacao_id":"${indCoord}"},
  {"pessoa_id":"${ALUNO2}","papel_projeto":"aluno","indicacao_id":"${indAluno2}"}]'`

beforeEach(async () => { db = await novoBanco(); await seed() })
afterEach(async () => { await db.close() })

describe('0062 editar_equipe (edição in-place pós Equipe Aprovada)', () => {
  it('HOST adiciona membro em aguardando_proposta SEM reverter status', async () => {
    await fecharEAvancar()
    expect(await status()).toBe('aguardando_proposta')
    await comoUsuario(db, { uid: COORD })
    await db.query(`select public.editar_equipe('${pid}',${ADD_ALUNO2()})`)
    expect(await status()).toBe('aguardando_proposta') // status INALTERADO
    expect(await membrosAtivos()).toBe(3) // COORD(host) + ALUNO + ALUNO2
  })

  it('ADMIN também edita em estágio avançado (status inalterado)', async () => {
    await fecharEAvancar()
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.editar_equipe('${pid}',${ADD_ALUNO2()})`)
    expect(await membrosAtivos()).toBe(3)
    expect(await status()).toBe('aguardando_proposta')
  })

  it('terceiro (não host, não admin) é NEGADO', async () => {
    await fecharEAvancar()
    await comoUsuario(db, { uid: ALUNO2 })
    expect(await negado(db.query(`select public.editar_equipe('${pid}',${ADD_ALUNO2()})`))).toBe(true)
  })

  it('editar_equipe NÃO troca o host (host diferente do atual é rejeitado — usa trocar_host)', async () => {
    await fecharEAvancar()
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    const tentativa = db.query(`select public.editar_equipe('${pid}','[
      {"pessoa_id":"${ALUNO2}","papel_projeto":"host","indicacao_id":"${indAluno2}"}]')`)
    expect(await negado(tentativa)).toBe(true)
  })

  it('membro sem indicação ativa válida é rejeitado (RN11/RN13)', async () => {
    await fecharEAvancar()
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    // indicacao_id não casa com a pessoa
    const tentativa = db.query(`select public.editar_equipe('${pid}','[
      {"pessoa_id":"${ALUNO2}","papel_projeto":"aluno","indicacao_id":"${indAluno}"}]')`)
    expect(await negado(tentativa)).toBe(true)
  })

  it('em_analise NÃO aceita editar_equipe (composição inicial é fechar_equipe)', async () => {
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    const tentativa = db.query(`select public.editar_equipe('${pid}',${ADD_ALUNO2()})`)
    expect(await negado(tentativa)).toBe(true)
  })
})
