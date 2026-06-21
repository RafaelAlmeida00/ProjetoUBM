// @vitest-environment node
// 0061 PGlite — indicacoes_coordenador.curso é o curso da PESSOA indicada, não os cursos da DOR.
// Bug (UI /app/dores "Indicações recebidas"): aluno aparecia com os cursos que o representante
// escolheu na dor (fallback dor_curso da 0060) em vez do próprio curso (aluno_curso, 0047).
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole } from './_pglite/harness'

const UID_ALUNO = '61000000-0000-0000-0000-000000000001'
const UID_COORD = '61000000-0000-0000-0000-000000000002'
const UID_ADM = '61000000-0000-0000-0000-000000000003'
const UID_ALUNO2 = '61000000-0000-0000-0000-000000000004' // aluno sem aluno_curso

const CURSO_ALUNO = '61000000-0000-0000-0000-0000000000a1' // Engenharia de Software (curso do aluno)
const CURSO_DOR = '61000000-0000-0000-0000-0000000000a2' // Direito (curso da DOR — diferente)

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_ALUNO}',  'aluno61@ubm.br'),
      ('${UID_COORD}',  'coord61@ubm.br'),
      ('${UID_ADM}',    'adm61@ubm.br'),
      ('${UID_ALUNO2}', 'aluno61b@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Emp61', '${UID_ALUNO}');
    update public.perfil set verificado_em = now(), nome_publico = 'Rafael Aluno' where user_id = '${UID_ALUNO}';
    update public.perfil set verificado_em = now(), nome_publico = 'Said Coord'   where user_id = '${UID_COORD}';
    update public.perfil set verificado_em = now(), nome_publico = 'Outro Aluno'  where user_id = '${UID_ALUNO2}';
    insert into public.curso(id, slug, nome) values
      ('${CURSO_ALUNO}', 'engenharia_de_software', 'Engenharia de Software'),
      ('${CURSO_DOR}',   'direito',                'Direito');
    -- aluno matriculado em Eng. Software; coord coordena Direito (= curso da dor, mas é DELE)
    insert into public.aluno_curso(user_id, curso_id) values ('${UID_ALUNO}', '${CURSO_ALUNO}');
    insert into public.coordenador_curso(user_id, curso_id, aprovado) values ('${UID_COORD}', '${CURSO_DOR}', true);
  `)
}

/** Dor com curso 'direito' (≠ curso do aluno) → projeto em_analise. */
async function seedProjeto(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  const empId = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id, empresa_id, status_dor, descricao, rep_nome, consentimento, consent_version, consent_at)
     values ('${UID_ALUNO}', '${empId}', 'em_moderacao', 'dor 61', 'Rep', true, 'v1', now()) returning id`,
  )).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', 'direito')`)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}', 'aprovar', null)`)
  await comoServiceRole(db)
  return (await db.query<{ id: string }>(`select id from public.projeto where dor_id = '${dorId}' limit 1`)).rows[0]!.id
}

async function indicar(db: import('@electric-sql/pglite').PGlite, projetoId: string, uid: string, papel: 'aluno' | 'coordenador') {
  await comoServiceRole(db)
  await db.query(
    `insert into public.indicacao(projeto_id, pessoa_id, papel_pretendido, created_by)
     values ('${projetoId}', '${uid}', '${papel}', '${uid}')`,
  )
}

describe('0061 — curso da indicação é o da PESSOA (não os cursos da dor)', () => {
  it('aluno indicado → curso = curso do ALUNO (aluno_curso), não os cursos da dor', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    await indicar(db, projetoId, UID_ALUNO, 'aluno')
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<{ curso: string }>(
      `select curso from public.indicacoes_coordenador('${projetoId}') where pessoa_id = '${UID_ALUNO}'`,
    )).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]!.curso).toBe('Engenharia de Software')
    expect(rows[0]!.curso).not.toMatch(/direito/i) // NÃO os cursos da dor
    await db.close()
  })

  it('coordenador indicado → curso = coordenador_curso (mantém)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    await indicar(db, projetoId, UID_COORD, 'coordenador')
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<{ curso: string }>(
      `select curso from public.indicacoes_coordenador('${projetoId}') where pessoa_id = '${UID_COORD}'`,
    )).rows
    expect(rows[0]!.curso).toBe('Direito')
    await db.close()
  })

  it('aluno SEM aluno_curso → curso vazio (não vaza os cursos da dor)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    await indicar(db, projetoId, UID_ALUNO2, 'aluno')
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<{ curso: string }>(
      `select curso from public.indicacoes_coordenador('${projetoId}') where pessoa_id = '${UID_ALUNO2}'`,
    )).rows
    expect(rows[0]!.curso).toBe('')
    await db.close()
  })

  it('anon continua sem execute (grant preservado após CREATE OR REPLACE)', async () => {
    const db = await novoBanco()
    const ok = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.indicacoes_coordenador(uuid)', 'execute') ok`,
    )).rows[0]!.ok
    expect(ok).toBe(false)
    await db.close()
  })
})
