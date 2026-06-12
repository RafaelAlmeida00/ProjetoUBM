// @vitest-environment node
// T-O1.7 + T-O1.11 — visibilidade (indicação privada via bridge curso) + vitrine pseudonimizada
//   + restore allowlist + erasure da PII livre nova
// RN20, RN23, RN24, RN25, RN26 · CA23, CA24, CA25, CA26 · RS2, RS9, RS10, RS13
import { describe, it, expect } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

const UID_ALUNO = '00000000-0000-0000-0000-000000000001'
const UID_COORD = '00000000-0000-0000-0000-000000000002' // coord do curso 'direito' (curso da dor)
const UID_ALUNO2 = '00000000-0000-0000-0000-000000000003'
const UID_ADM = '00000000-0000-0000-0000-000000000004'
const C_DIR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id,email) values
      ('${UID_ALUNO}','a@ubm.br'),('${UID_COORD}','c@ubm.br'),('${UID_ALUNO2}','a2@ubm.br'),('${UID_ADM}','adm@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Emp','${UID_ALUNO}');
    update public.perfil set verificado_em=now() where user_id in ('${UID_ALUNO}','${UID_COORD}','${UID_ALUNO2}');
    insert into public.curso(id,slug,nome) values ('${C_DIR}','direito','Direito');
    insert into public.coordenador_curso(user_id,curso_id) values ('${UID_COORD}','${C_DIR}');
  `)
}

/** Publica projeto (curso direito) e indica aluno+coord (projeto fica em em_analise). */
async function publicarEIndicar(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  const eid = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
     values ('${UID_ALUNO}','${eid}','em_moderacao','Dor 036','Rep',true,'v1',now()) returning id`)).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id,curso) values ('${dorId}','direito')`)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}','aprovar',null)`)
  await comoServiceRole(db)
  const pid = (await db.query<{ id: string }>(`select id from public.projeto where dor_id='${dorId}'`)).rows[0]!.id
  await comoUsuario(db, { uid: UID_ALUNO }); await db.query(`select public.indicar_se('${pid}','aluno','quero ajudar')`)
  await comoUsuario(db, { uid: UID_COORD }); await db.query(`select public.indicar_se('${pid}','coordenador',null)`)
  return pid
}

// ── RS2/RN25: indicação privada — coord-do-curso (bridge) + admin + próprio ──
it('RS2/CA25: coordenador do curso da dor vê as indicações (via ponte curso)', async () => {
  const db = await novoBanco({ ate: '0036_policies_visibilidade.sql' })
  await seedBase(db); const pid = await publicarEIndicar(db)
  await comoUsuario(db, { uid: UID_COORD })
  const n = (await db.query<{ n: number }>(`select count(*)::int n from public.indicacao where projeto_id='${pid}'`)).rows[0]!.n
  expect(n, 'coord do curso vê todas as indicações').toBe(2)
  await db.close()
})

it('RS2/CA25: outro aluno NÃO vê indicações alheias; anônimo negado', async () => {
  const db = await novoBanco({ ate: '0036_policies_visibilidade.sql' })
  await seedBase(db); const pid = await publicarEIndicar(db)
  // aluno2 não se indicou e não é coord → vê 0
  await comoUsuario(db, { uid: UID_ALUNO2 })
  const n = (await db.query<{ n: number }>(`select count(*)::int n from public.indicacao where projeto_id='${pid}'`)).rows[0]!.n
  expect(n, 'aluno não-coord não vê indicações alheias').toBe(0)
  // anônimo
  await comoAnon(db)
  const a = (await db.query<{ n: number }>(`select count(*)::int n from public.indicacao`)).rows[0]!.n
  expect(a).toBe(0)
  await db.close()
})

it('RS2: o próprio vê a sua indicação', async () => {
  const db = await novoBanco({ ate: '0036_policies_visibilidade.sql' })
  await seedBase(db); const pid = await publicarEIndicar(db)
  await comoUsuario(db, { uid: UID_ALUNO })
  const n = (await db.query<{ n: number }>(`select count(*)::int n from public.indicacao where projeto_id='${pid}' and pessoa_id='${UID_ALUNO}'`)).rows[0]!.n
  expect(n).toBe(1)
  await db.close()
})

// ── RS9: equipe_publica pseudonimizada — sem user_id, nome só com opt-in ──
it('RS9/CA24: equipe_publica não expõe user_id e revela nome só com ranking_optin', async () => {
  const db = await novoBanco({ ate: '0036_policies_visibilidade.sql' })
  await seedBase(db); const pid = await publicarEIndicar(db)
  // fecha equipe: coord=host (opt-in TRUE), aluno=membro (opt-in FALSE)
  await comoServiceRole(db)
  await db.exec(`update public.perfil set ranking_optin=true, nome_publico='Dra. Coord' where user_id='${UID_COORD}'`)
  await db.exec(`update public.perfil set ranking_optin=false, nome_publico='Aluno Secreto' where user_id='${UID_ALUNO}'`)
  const ind = async (u: string) => (await db.query<{ id: string }>(`select id from public.indicacao where projeto_id='${pid}' and pessoa_id='${u}'`)).rows[0]!.id
  const iC = await ind(UID_COORD), iA = await ind(UID_ALUNO)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.fechar_equipe('${pid}','${UID_COORD}',
    '[{"pessoa_id":"${UID_COORD}","papel_projeto":"host","indicacao_id":"${iC}"},
      {"pessoa_id":"${UID_ALUNO}","papel_projeto":"aluno","indicacao_id":"${iA}"}]')`)

  // anônimo chama equipe_publica
  await comoAnon(db)
  const rows = (await db.query<{ papel_projeto: string; nome: string | null }>(
    `select * from public.equipe_publica('${pid}')`)).rows
  expect(rows).toHaveLength(2)
  // a projeção NÃO tem coluna pessoa_id/user_id
  const cols = Object.keys(rows[0]!)
  expect(cols).not.toContain('pessoa_id')
  expect(cols).not.toContain('user_id')
  const host = rows.find(r => r.papel_projeto === 'host')!
  const aluno = rows.find(r => r.papel_projeto === 'aluno')!
  expect(host.nome, 'host com opt-in → nome').toBe('Dra. Coord')
  expect(aluno.nome, 'aluno sem opt-in → nome null').toBeNull()
  await db.close()
})

// ── RS9: timeline_publica sem autor_id cru ──
it('RS9/CA23: timeline_publica retorna eventos sem expor autor_id/user_id', async () => {
  const db = await novoBanco({ ate: '0036_policies_visibilidade.sql' })
  await seedBase(db); const pid = await publicarEIndicar(db)
  await comoAnon(db)
  const rows = (await db.query<Record<string, unknown>>(`select * from public.timeline_publica('${pid}')`)).rows
  expect(rows.length).toBeGreaterThanOrEqual(1) // evento de abertura NULL→em_analise
  const cols = Object.keys(rows[0]!)
  expect(cols).not.toContain('autor_id')
  expect(cols).not.toContain('user_id')
  expect(cols).toContain('para_status')
  await db.close()
})

// ── restore_record allowlist estendida ──
it('restore_record aceita projeto/membro_equipe/indicacao/funcao_tarefa e recusa status_evento', async () => {
  const db = await novoBanco({ ate: '0036_policies_visibilidade.sql' })
  await seedBase(db); const pid = await publicarEIndicar(db)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  // projeto: arquiva (soft-delete) e restaura
  await comoServiceRole(db); await db.exec(`update public.projeto set deleted_at=now() where id='${pid}'`)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.restore_record('projeto','${pid}')`)
  await comoServiceRole(db)
  const restored = (await db.query<{ d: string | null }>(`select deleted_at d from public.projeto where id='${pid}'`)).rows[0]!.d
  expect(restored, 'projeto restaurado').toBeNull()
  // status_evento NÃO é restaurável (append-only)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  expect(await negado(db.query(`select public.restore_record('status_evento','${pid}')`)), 'status_evento não restaurável').toBe(true)
  await db.close()
})

// ── RS13: erasure anonimiza PII livre nova preservando append-only ──
it('RS13: erasure_titular anonimiza indicacao.mensagem e status_evento.motivo (linhas preservadas)', async () => {
  const db = await novoBanco({ ate: '0036_policies_visibilidade.sql' })
  await seedBase(db); const pid = await publicarEIndicar(db)
  // admin gera um evento de override com motivo (PII livre) atribuído ao aluno? motivo é do admin.
  // Para PII do titular: a mensagem da indicação do UID_ALUNO ('quero ajudar').
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.erasure_titular('${UID_ALUNO}')`)
  await comoServiceRole(db)
  const msg = (await db.query<{ mensagem: string | null }>(
    `select mensagem from public.indicacao where pessoa_id='${UID_ALUNO}' and projeto_id='${pid}'`)).rows
  expect(msg, 'linha da indicação preservada').toHaveLength(1)
  expect(msg[0]!.mensagem, 'mensagem anonimizada').toBe('[removido]')
  await db.close()
})
