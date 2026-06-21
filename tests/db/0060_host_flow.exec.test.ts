// @vitest-environment node
/**
 * 0060 — Fluxo de host: admin elege (sem fechar) / host compõe e fecha / reversibilidade do admin.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

const ALUNO = '00000000-0000-0000-0000-000000000001'
const COORD = '00000000-0000-0000-0000-000000000002'
const ADM = '00000000-0000-0000-0000-000000000004'
const C_DIR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

let db: PGlite
let pid: string
let indAluno: string
let indCoord: string

async function seedEPublica() {
  await db.exec(`
    insert into auth.users(id,email) values ('${ALUNO}','a@ubm.br'),('${COORD}','c@ubm.br'),('${ADM}','adm@ubm.br');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Emp','${ALUNO}');
    update public.perfil set verificado_em=now() where user_id in ('${ALUNO}','${COORD}');
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
  await comoUsuario(db, { uid: ALUNO }); await db.query(`select public.indicar_se('${pid}','aluno','quero')`)
  await comoUsuario(db, { uid: COORD }); await db.query(`select public.indicar_se('${pid}','coordenador',null)`)
  await comoServiceRole(db)
  indAluno = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${ALUNO}'`)).rows[0]!.id
  indCoord = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${COORD}'`)).rows[0]!.id
}

beforeEach(async () => { db = await novoBanco(); await seedEPublica() })
afterEach(async () => { await db.close() })

async function status(): Promise<string> {
  return (await db.query<{ status: string }>(`select status from public.projeto where id='${pid}'`)).rows[0]!.status
}
async function elegerHostAdmin() {
  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.eleger_host('${pid}','${COORD}')`)
}
const MEMBROS_FULL = () => `'[
  {"pessoa_id":"${COORD}","papel_projeto":"host","indicacao_id":"${indCoord}"},
  {"pessoa_id":"${ALUNO}","papel_projeto":"aluno","indicacao_id":"${indAluno}"}]'`

describe('0060 fluxo de host', () => {
  it('admin elege host: projeto SEGUE em_analise (aberto) e host fica setado', async () => {
    await elegerHostAdmin()
    expect(await status()).toBe('em_analise')
    const h = (await db.query<{ h: string }>(`select host_coordenador_id h from public.projeto where id='${pid}'`)).rows[0]!.h
    expect(h).toBe(COORD)
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.membro_equipe where projeto_id='${pid}' and papel_projeto='host' and deleted_at is null`)).rows[0]!.n
    expect(n).toBe(1)
  })

  it('não-admin não pode eleger host', async () => {
    await comoUsuario(db, { uid: COORD })
    expect(await negado(db.query(`select public.eleger_host('${pid}','${COORD}')`))).toBe(true)
  })

  it('host eleito fecha a equipe (→ aprovado)', async () => {
    await elegerHostAdmin()
    await comoUsuario(db, { uid: COORD })
    await db.query(`select public.fechar_equipe('${pid}','${COORD}',${MEMBROS_FULL()})`)
    expect(await status()).toBe('aprovado')
  })

  it('coordenador SEM ser host eleito não fecha equipe', async () => {
    await comoUsuario(db, { uid: COORD })
    expect(await negado(db.query(`select public.fechar_equipe('${pid}','${COORD}',${MEMBROS_FULL()})`))).toBe(true)
  })

  it('admin fecha direto (sem eleger antes) — caminho retrocompatível', async () => {
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe('${pid}','${COORD}',${MEMBROS_FULL()})`)
    expect(await status()).toBe('aprovado')
  })

  it('admin reabre indicações: abre a janela SEM regredir o status (0063)', async () => {
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe('${pid}','${COORD}',${MEMBROS_FULL()})`)
    expect(await status()).toBe('aprovado')
    await db.query(`select public.reabrir_indicacoes('${pid}')`)
    // 0063: janela desacoplada do status — reabrir NÃO regride a etapa do projeto.
    expect(await status()).toBe('aprovado')
    const a = (await db.query<{ a: boolean }>(`select indicacoes_abertas a from public.projeto where id='${pid}'`)).rows[0]!.a
    expect(a).toBe(true)
  })

  it('remover_membro: admin remove aluno; NÃO remove host; host NÃO remove a si', async () => {
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe('${pid}','${COORD}',${MEMBROS_FULL()})`)
    await db.query(`select public.remover_membro('${pid}','${ALUNO}')`)
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.membro_equipe where projeto_id='${pid}' and pessoa_id='${ALUNO}' and deleted_at is null`)).rows[0]!.n
    expect(n).toBe(0)
    // host não removível por aqui
    expect(await negado(db.query(`select public.remover_membro('${pid}','${COORD}')`))).toBe(true)
    // host não remove a si mesmo
    await comoUsuario(db, { uid: COORD })
    expect(await negado(db.query(`select public.remover_membro('${pid}','${COORD}')`))).toBe(true)
  })

  it('indicações continuam visíveis ao host (compor equipe)', async () => {
    await elegerHostAdmin()
    await comoUsuario(db, { uid: COORD })
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.indicacoes_coordenador('${pid}')`)).rows[0]!.n
    expect(n).toBeGreaterThanOrEqual(2)
  })

  it('equipe_gestao: admin vê membros com pessoa_id; anon não vê nada', async () => {
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe('${pid}','${COORD}',${MEMBROS_FULL()})`)
    const rows = (await db.query<{ pessoa_id: string; papel_projeto: string }>(`select * from public.equipe_gestao('${pid}')`)).rows
    expect(rows.length).toBe(2)
    expect(rows.some((r) => r.pessoa_id === COORD && r.papel_projeto === 'host')).toBe(true)
    await comoAnon(db)
    const anon = (await db.query(`select * from public.equipe_gestao('${pid}')`)).rows
    expect(anon.length).toBe(0)
  })
})
