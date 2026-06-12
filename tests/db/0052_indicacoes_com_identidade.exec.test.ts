// @vitest-environment node
// T-B6 PGlite — RPC indicacoes_coordenador: identidade do candidato gated por papel
// Bug #6 / 0052_indicacoes_com_identidade.sql
// Rastreab.: CA25, RS2, RS9 · RN25
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, comoAnon } from './_pglite/harness'

const UID_ALUNO  = '10000000-0000-0000-0000-000000000001'
const UID_COORD  = '10000000-0000-0000-0000-000000000002'
const UID_ADM    = '10000000-0000-0000-0000-000000000003'
const UID_OUTRO  = '10000000-0000-0000-0000-000000000004'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_ALUNO}', 'aluno@ubm.br'),
      ('${UID_COORD}', 'coord@ubm.br'),
      ('${UID_ADM}',   'admin@ubm.br'),
      ('${UID_OUTRO}', 'outro@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('EmpTeste52', '${UID_ALUNO}');
    update public.perfil set verificado_em = now(), nome_publico = 'Maria Aluno'
      where user_id = '${UID_ALUNO}';
    update public.perfil set verificado_em = now(), nome_publico = 'Prof. Coord'
      where user_id = '${UID_COORD}';
    insert into public.curso(id, slug, nome) values
      ('52000000-0000-0000-0000-000000000001', 'direito', 'Direito');
    insert into public.coordenador_curso(user_id, curso_id) values
      ('${UID_COORD}', '52000000-0000-0000-0000-000000000001');
  `)
}

/** Publica dor com curso e retorna projetoId */
async function seedProjeto(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  const empId = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id, empresa_id, status_dor, descricao, rep_nome, consentimento, consent_version, consent_at)
     values ('${UID_ALUNO}', '${empId}', 'em_moderacao', 'dor 52', 'Rep', true, 'v1', now()) returning id`
  )).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', 'direito')`)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}', 'aprovar', null)`)
  await comoServiceRole(db)
  const projetoId = (await db.query<{ id: string }>(
    `select id from public.projeto where dor_id = '${dorId}' limit 1`
  )).rows[0]!.id
  return projetoId
}

/** Indica o aluno no projeto (como service_role para bypass RLS) */
async function indicarAluno(db: import('@electric-sql/pglite').PGlite, projetoId: string) {
  await comoServiceRole(db)
  await db.query(
    `insert into public.indicacao(projeto_id, pessoa_id, papel_pretendido, created_by)
     values ('${projetoId}', '${UID_ALUNO}', 'aluno', '${UID_ALUNO}')`
  )
}

describe('0052 indicacoes_coordenador — identidade gated por papel', () => {
  it('RPC existe após migração', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'indicacoes_coordenador'`
    )).rows
    expect(rows).toHaveLength(1)
    await db.close()
  })

  it('admin vê identidade do candidato (aluno_nome, aluno_email)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    await indicarAluno(db, projetoId)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<{ aluno_nome: string; aluno_email: string }>(
      `select aluno_nome, aluno_email from public.indicacoes_coordenador('${projetoId}')`
    )).rows

    expect(rows).toHaveLength(1)
    expect(rows[0]!.aluno_nome).toBe('Maria Aluno')
    expect(rows[0]!.aluno_email).toBe('aluno@ubm.br')
    await db.close()
  })

  it('coordenador do curso vê identidade do candidato (CA25/RS2)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    await indicarAluno(db, projetoId)

    await comoUsuario(db, { uid: UID_COORD })
    const rows = (await db.query<{ aluno_nome: string; aluno_email: string }>(
      `select aluno_nome, aluno_email from public.indicacoes_coordenador('${projetoId}')`
    )).rows

    expect(rows).toHaveLength(1)
    expect(rows[0]!.aluno_nome).toBe('Maria Aluno')
    await db.close()
  })

  it('usuário sem papel (outro) recebe retorno vazio — peça lacrada (CA25/RS9)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    await indicarAluno(db, projetoId)

    await comoUsuario(db, { uid: UID_OUTRO })
    const rows = (await db.query<{ id: string }>(
      `select id from public.indicacoes_coordenador('${projetoId}')`
    )).rows

    expect(rows).toHaveLength(0)
    await db.close()
  })

  it('anon não tem execute na RPC (grant negado)', async () => {
    const db = await novoBanco()
    const ok = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.indicacoes_coordenador(uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(ok).toBe(false)
    await db.close()
  })

  it('resultado inclui papel_pretendido e deleted_at (shape completo)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    await indicarAluno(db, projetoId)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    const rows = (await db.query<{ papel_pretendido: string; deleted_at: string | null }>(
      `select papel_pretendido, deleted_at from public.indicacoes_coordenador('${projetoId}')`
    )).rows

    expect(rows[0]!.papel_pretendido).toBe('aluno')
    expect(rows[0]!.deleted_at).toBeNull()
    await db.close()
  })
})
