// @vitest-environment node
/**
 * 0063 — Janela de indicação DESACOPLADA do status (decisão do cliente 2026-06-21).
 *
 * Problema: "Reabrir indicações" regredia o status para em_analise, e indicar_se só
 * funcionava em em_analise. Logo, equipe que perdeu membros em fase avançada (sem
 * ninguém mais indicado) ficava sem saída.
 *
 * Correção: projeto.indicacoes_abertas (booleano) controla a janela, independente do
 * status. reabrir/encerrar_indicacoes (admin OU host, qualquer fase) alternam a flag
 * SEM tocar no status. indicar_se passa a aceitar em_analise OU indicacoes_abertas.
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
let indCoord: string
let indAluno: string

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
  await comoUsuario(db, { uid: ALUNO }); await db.query(`select public.indicar_se('${pid}','aluno','quero')`)
  await comoUsuario(db, { uid: COORD }); await db.query(`select public.indicar_se('${pid}','coordenador',null)`)
  await comoServiceRole(db)
  indCoord = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${COORD}'`)).rows[0]!.id
  indAluno = (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${ALUNO}'`)).rows[0]!.id
}

// fecha equipe e avança para aguardando_proposta (janela fechada por padrão)
async function fecharEAvancar() {
  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.eleger_host('${pid}','${COORD}')`)
  await comoUsuario(db, { uid: COORD })
  await db.query(`select public.fechar_equipe('${pid}','${COORD}','[
    {"pessoa_id":"${COORD}","papel_projeto":"host","indicacao_id":"${indCoord}"},
    {"pessoa_id":"${ALUNO}","papel_projeto":"aluno","indicacao_id":"${indAluno}"}]')`)
  await db.query(`select public.avancar_projeto('${pid}')`)
}
async function status() { return (await db.query<{ status: string }>(`select status from public.projeto where id='${pid}'`)).rows[0]!.status }
async function abertas() { return (await db.query<{ a: boolean }>(`select indicacoes_abertas a from public.projeto where id='${pid}'`)).rows[0]!.a }

beforeEach(async () => { db = await novoBanco(); await seed() })
afterEach(async () => { await db.close() })

describe('0063 indicacoes_abertas (janela desacoplada do status)', () => {
  it('PRECONDIÇÃO: em aguardando_proposta com janela fechada, novo aluno NÃO indica', async () => {
    await fecharEAvancar()
    expect(await status()).toBe('aguardando_proposta')
    expect(await abertas()).toBe(false)
    await comoUsuario(db, { uid: ALUNO2 })
    expect(await negado(db.query(`select public.indicar_se('${pid}','aluno','entro?')`))).toBe(true)
  })

  it('admin REABRE em aguardando_proposta: indicacoes_abertas=true e status INALTERADO', async () => {
    await fecharEAvancar()
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.reabrir_indicacoes('${pid}')`)
    expect(await abertas()).toBe(true)
    expect(await status()).toBe('aguardando_proposta') // NUNCA regride
  })

  it('após reabrir, novo aluno CONSEGUE indicar_se — e o status segue aguardando_proposta', async () => {
    await fecharEAvancar()
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.reabrir_indicacoes('${pid}')`)
    await comoUsuario(db, { uid: ALUNO2 })
    await db.query(`select public.indicar_se('${pid}','aluno','agora entro')`)
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.indicacao where projeto_id='${pid}' and pessoa_id='${ALUNO2}' and deleted_at is null`)).rows[0]!.n
    expect(n).toBe(1)
    expect(await status()).toBe('aguardando_proposta')
  })

  it('HOST também reabre (não só admin)', async () => {
    await fecharEAvancar()
    await comoUsuario(db, { uid: COORD }) // host
    await db.query(`select public.reabrir_indicacoes('${pid}')`)
    expect(await abertas()).toBe(true)
  })

  it('ENCERRAR fecha a janela de novo (novo indicar volta a ser negado)', async () => {
    await fecharEAvancar()
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.reabrir_indicacoes('${pid}')`)
    await db.query(`select public.encerrar_indicacoes('${pid}')`)
    expect(await abertas()).toBe(false)
    await comoUsuario(db, { uid: ALUNO2 })
    expect(await negado(db.query(`select public.indicar_se('${pid}','aluno','tarde')`))).toBe(true)
  })

  it('terceiro (não host, não admin) NÃO reabre nem encerra', async () => {
    await fecharEAvancar()
    await comoUsuario(db, { uid: ALUNO2 })
    expect(await negado(db.query(`select public.reabrir_indicacoes('${pid}')`))).toBe(true)
    expect(await negado(db.query(`select public.encerrar_indicacoes('${pid}')`))).toBe(true)
  })

  it('reabrir funciona ATÉ em projeto finalizado (status inalterado)', async () => {
    await fecharEAvancar()
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.override_transicao('${pid}','finalizado','encerramento p/ teste')`)
    expect(await status()).toBe('finalizado')
    await db.query(`select public.reabrir_indicacoes('${pid}')`)
    expect(await abertas()).toBe(true)
    expect(await status()).toBe('finalizado')
  })
})
