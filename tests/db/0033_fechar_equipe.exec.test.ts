// @vitest-environment node
// T-O1.4 — membro_equipe + helpers de escopo + fechar_equipe (atômico)
// RN10, RN11, RN12, RN13 · CA9, CA10, CA11, CA12 · RS1, RS4, RS5, RS10
import { describe, it, expect } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

const UID_ALUNO = '00000000-0000-0000-0000-000000000001'
const UID_COORD_DIREITO = '00000000-0000-0000-0000-000000000002' // coordenador do curso 'direito'
const UID_COORD_MED = '00000000-0000-0000-0000-000000000003'    // coordenador do curso 'medicina_veterinaria'
const UID_ALUNO2 = '00000000-0000-0000-0000-000000000004'
const UID_ADM = '00000000-0000-0000-0000-000000000005'
const UID_COORD_OUTRO = '00000000-0000-0000-0000-000000000006' // coordenador de curso NÃO relacionado à dor

const CURSO_ID_DIREITO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CURSO_ID_MED = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const CURSO_ID_ADM_EMP = 'cccccccc-cccc-cccc-cccc-cccccccccccc' // curso não relacionado à dor

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_ALUNO}',        'aluno@ubm.br'),
      ('${UID_COORD_DIREITO}','coord.dir@ubm.br'),
      ('${UID_COORD_MED}',    'coord.med@ubm.br'),
      ('${UID_ALUNO2}',       'aluno2@ubm.br'),
      ('${UID_ADM}',          'admin@ubm.br'),
      ('${UID_COORD_OUTRO}',  'coord.outro@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('EmpresaTeste', '${UID_ALUNO}');
    -- Verifica todos exceto nenhum para este teste (todos já verificados para poder indicar)
    update public.perfil set verificado_em = now()
      where user_id in ('${UID_ALUNO}', '${UID_COORD_DIREITO}', '${UID_COORD_MED}', '${UID_ALUNO2}', '${UID_COORD_OUTRO}');
    -- Cursos
    insert into public.curso(id, slug, nome) values
      ('${CURSO_ID_DIREITO}', 'direito',              'Direito'),
      ('${CURSO_ID_MED}',     'medicina_veterinaria', 'Medicina Veterinária'),
      ('${CURSO_ID_ADM_EMP}', 'administracao',        'Administração');
    -- Coordenadores
    insert into public.coordenador_curso(user_id, curso_id) values
      ('${UID_COORD_DIREITO}', '${CURSO_ID_DIREITO}'),
      ('${UID_COORD_MED}',     '${CURSO_ID_MED}'),
      ('${UID_COORD_OUTRO}',   '${CURSO_ID_ADM_EMP}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

/**
 * Publica dor com curso 'direito' e retorna {dorId, projetoId}.
 * UID_COORD_DIREITO é coordenador do curso da dor.
 * UID_COORD_MED e UID_COORD_OUTRO são coordenadores de outros cursos.
 */
async function publicarProjeto(
  db: import('@electric-sql/pglite').PGlite,
  opts: { cursoSlug?: string } = { cursoSlug: 'direito' }
): Promise<{ dorId: string; projetoId: string }> {
  const eid = await empId(db)
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id, empresa_id, status_dor, descricao, rep_nome, consentimento, consent_version, consent_at)
     values ('${UID_ALUNO}', '${eid}', 'em_moderacao', 'Dor teste 033', 'Rep A', true, 'v1', now()) returning id`
  )).rows[0]!.id

  if (opts.cursoSlug) {
    await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', '${opts.cursoSlug}')`)
  }

  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}', 'aprovar', null)`)

  await comoServiceRole(db)
  const projetoId = (await db.query<{ id: string }>(
    `select id from public.projeto where dor_id = '${dorId}' limit 1`
  )).rows[0]!.id

  return { dorId, projetoId }
}

/** Indica o usuário como coordenador no projeto (setup para fechar equipe). */
async function indicarComoCoord(
  db: import('@electric-sql/pglite').PGlite,
  uid: string,
  projetoId: string
) {
  await comoUsuario(db, { uid })
  await db.query(`select public.indicar_se('${projetoId}', 'coordenador', null)`)
}

/** Indica o usuário como aluno no projeto (setup para fechar equipe). */
async function indicarComoAluno(
  db: import('@electric-sql/pglite').PGlite,
  uid: string,
  projetoId: string
) {
  await comoUsuario(db, { uid })
  await db.query(`select public.indicar_se('${projetoId}', 'aluno', null)`)
}

/** Recupera indicação ativa de uma pessoa num projeto. */
async function getIndicacaoId(
  db: import('@electric-sql/pglite').PGlite,
  pessoaId: string,
  projetoId: string
): Promise<string> {
  await comoServiceRole(db)
  return (await db.query<{ id: string }>(
    `select id from public.indicacao
     where projeto_id = '${projetoId}' and pessoa_id = '${pessoaId}' and deleted_at is null`
  )).rows[0]!.id
}

describe('0033 membro_equipe + fechar_equipe', () => {

  // ── Estrutura ───────────────────────────────────────────────────────────
  it('membro_equipe tem RLS enable+force (RS1)', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })

    const rows = (await db.query<{ rls: boolean; force: boolean }>(
      `select relrowsecurity as rls, relforcerowsecurity as force
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and relname = 'membro_equipe'`
    )).rows

    expect(rows).toHaveLength(1)
    expect(rows[0]!.rls).toBe(true)
    expect(rows[0]!.force).toBe(true)
    await db.close()
  })

  it('membro_equipe tem colunas obrigatórias (projeto_id, pessoa_id, papel_projeto, indicacao_id, soft-delete)', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })

    const cols = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'membro_equipe'`
    )).rows.map(r => r.column_name)

    expect(cols).toContain('id')
    expect(cols).toContain('projeto_id')
    expect(cols).toContain('pessoa_id')
    expect(cols).toContain('papel_projeto')
    expect(cols).toContain('indicacao_id')
    expect(cols).toContain('created_at')
    expect(cols).toContain('deleted_at')
    await db.close()
  })

  it('uq_um_host_por_projeto existe como índice único parcial (where papel_projeto=host and deleted_at is null)', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })

    const rows = (await db.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
       where schemaname = 'public' and tablename = 'membro_equipe'
         and indexname = 'uq_um_host_por_projeto'`
    )).rows

    expect(rows).toHaveLength(1)
    const def = rows[0]!.indexdef.toLowerCase()
    expect(def).toContain('where')
    expect(def).toContain('host')
    expect(def).toContain('deleted_at is null')
    await db.close()
  })

  // ── CA9/RN10: só admin fecha — coord/aluno negados ───────────────────────
  it('CA9/RN10: coordenador não pode fechar equipe (só admin)', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)
    await indicarComoCoord(db, UID_COORD_DIREITO, projetoId)
    const indId = await getIndicacaoId(db, UID_COORD_DIREITO, projetoId)

    await comoUsuario(db, { uid: UID_COORD_DIREITO })
    expect(await negado(
      db.query(`select public.fechar_equipe(
        '${projetoId}',
        '${UID_COORD_DIREITO}',
        '[{"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indId}"}]'
      )`)
    ), 'coordenador não pode fechar equipe').toBe(true)
    await db.close()
  })

  it('CA9/RN10: aluno não pode fechar equipe (só admin)', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)
    await indicarComoCoord(db, UID_COORD_DIREITO, projetoId)
    const indId = await getIndicacaoId(db, UID_COORD_DIREITO, projetoId)

    await comoUsuario(db, { uid: UID_ALUNO })
    expect(await negado(
      db.query(`select public.fechar_equipe(
        '${projetoId}',
        '${UID_COORD_DIREITO}',
        '[{"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indId}"}]'
      )`)
    ), 'aluno não pode fechar equipe').toBe(true)
    await db.close()
  })

  // ── CA10/RN10: admin fecha equipe atomicamente — compõe membros + host + aprova ──
  it('CA10/RN10: admin fecha equipe atomicamente (membros+host+projeto aprovado)', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    // Indica aluno e coordenador
    await indicarComoAluno(db, UID_ALUNO, projetoId)
    await indicarComoCoord(db, UID_COORD_DIREITO, projetoId)

    const indAlunoId = await getIndicacaoId(db, UID_ALUNO, projetoId)
    const indCoordId = await getIndicacaoId(db, UID_COORD_DIREITO, projetoId)

    // Admin fecha a equipe
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe(
      '${projetoId}',
      '${UID_COORD_DIREITO}',
      '[
        {"pessoa_id":"${UID_ALUNO}","papel_projeto":"aluno","indicacao_id":"${indAlunoId}"},
        {"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indCoordId}"}
      ]'
    )`)

    await comoServiceRole(db)

    // Verifica membros inseridos
    const membros = (await db.query<{ pessoa_id: string; papel_projeto: string }>(
      `select pessoa_id::text, papel_projeto::text from public.membro_equipe
       where projeto_id = '${projetoId}' and deleted_at is null
       order by papel_projeto`
    )).rows

    expect(membros).toHaveLength(2)
    const papeis = membros.map(m => m.papel_projeto)
    expect(papeis).toContain('host')
    expect(papeis).toContain('aluno')

    // Verifica projeto aprovado
    const proj = (await db.query<{ status: string; host_coordenador_id: string; aprovado_em: string | null }>(
      `select status::text, host_coordenador_id::text, aprovado_em
       from public.projeto where id = '${projetoId}'`
    )).rows[0]!

    expect(proj.status).toBe('aprovado')
    expect(proj.host_coordenador_id).toBe(UID_COORD_DIREITO)
    expect(proj.aprovado_em).not.toBeNull()

    // Verifica evento de transição gravado
    const eventos = (await db.query<{ de_status: string; para_status: string }>(
      `select de_status::text, para_status::text from public.status_evento
       where projeto_id = '${projetoId}' and para_status = 'aprovado'`
    )).rows
    expect(eventos).toHaveLength(1)
    expect(eventos[0]!.de_status).toBe('em_analise')

    await db.close()
  })

  // ── RN11: host = coord indicado de qualquer curso — aceito ───────────────
  it('RN11: host pode ser coordenador indicado de qualquer curso (não só o da dor)', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    // Dor com curso 'direito'; UID_COORD_MED é coord de 'medicina_veterinaria' (outro curso)
    const { projetoId } = await publicarProjeto(db, { cursoSlug: 'direito' })

    // UID_COORD_MED se indica como coordenador (papel_pretendido=coordenador, qualquer curso — RN5)
    await indicarComoCoord(db, UID_COORD_MED, projetoId)
    const indCoordMedId = await getIndicacaoId(db, UID_COORD_MED, projetoId)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    // Deve funcionar: host de outro curso é aceito (RN11 — aberto a qualquer coordenador)
    await db.query(`select public.fechar_equipe(
      '${projetoId}',
      '${UID_COORD_MED}',
      '[{"pessoa_id":"${UID_COORD_MED}","papel_projeto":"host","indicacao_id":"${indCoordMedId}"}]'
    )`)

    await comoServiceRole(db)
    const proj = (await db.query<{ status: string; host_coordenador_id: string }>(
      `select status::text, host_coordenador_id::text from public.projeto where id = '${projetoId}'`
    )).rows[0]!

    expect(proj.status).toBe('aprovado')
    expect(proj.host_coordenador_id).toBe(UID_COORD_MED)
    await db.close()
  })

  // ── CA11: host não-coordenador-indicado é negado ─────────────────────────
  it('CA11: fechar_equipe nega host que não tem indicação ativa como coordenador', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    // UID_ALUNO se indica como aluno (não coordenador) — não pode ser host
    await indicarComoAluno(db, UID_ALUNO, projetoId)
    const indAlunoId = await getIndicacaoId(db, UID_ALUNO, projetoId)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    expect(await negado(
      db.query(`select public.fechar_equipe(
        '${projetoId}',
        '${UID_ALUNO}',
        '[{"pessoa_id":"${UID_ALUNO}","papel_projeto":"host","indicacao_id":"${indAlunoId}"}]'
      )`)
    ), 'host sem indicação de coordenador deve ser negado').toBe(true)
    await db.close()
  })

  // ── CA11 (variante): host sem qualquer indicação é negado ─────────────────
  it('CA11: fechar_equipe nega host sem nenhuma indicação no projeto', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    // UID_COORD_DIREITO não se indicou
    const fakeIndId = '99999999-9999-9999-9999-999999999999'

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    expect(await negado(
      db.query(`select public.fechar_equipe(
        '${projetoId}',
        '${UID_COORD_DIREITO}',
        '[{"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${fakeIndId}"}]'
      )`)
    ), 'host sem indicação deve ser negado').toBe(true)
    await db.close()
  })

  // ── CA12/RN13: 2º host ativo negado por uq_um_host_por_projeto ─────────
  it('CA12/RN13: inserir 2º host ativo viola uq_um_host_por_projeto', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    // Fecha a equipe com coord_direito como host
    await indicarComoCoord(db, UID_COORD_DIREITO, projetoId)
    const indId = await getIndicacaoId(db, UID_COORD_DIREITO, projetoId)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe(
      '${projetoId}',
      '${UID_COORD_DIREITO}',
      '[{"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indId}"}]'
    )`)

    // Tenta inserir direto um segundo host (via service_role para contornar RLS, testando a UQ)
    await comoServiceRole(db)
    expect(await negado(
      db.query(
        `insert into public.membro_equipe(projeto_id, pessoa_id, papel_projeto)
         values ('${projetoId}', '${UID_ALUNO}', 'host')`
      )
    ), '2º host ativo deve violar uq_um_host_por_projeto').toBe(true)
    await db.close()
  })

  // ── RN13/RS5: coerência host_coordenador_id↔membro_equipe(host) ─────────
  it('RN13/RS5: host_coordenador_id do projeto coincide com o membro_equipe(host)', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await indicarComoCoord(db, UID_COORD_DIREITO, projetoId)
    const indId = await getIndicacaoId(db, UID_COORD_DIREITO, projetoId)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe(
      '${projetoId}',
      '${UID_COORD_DIREITO}',
      '[{"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indId}"}]'
    )`)

    await comoServiceRole(db)

    const proj = (await db.query<{ host_coordenador_id: string }>(
      `select host_coordenador_id::text from public.projeto where id = '${projetoId}'`
    )).rows[0]!

    const membroHost = (await db.query<{ pessoa_id: string }>(
      `select pessoa_id::text from public.membro_equipe
       where projeto_id = '${projetoId}' and papel_projeto = 'host' and deleted_at is null`
    )).rows[0]!

    expect(proj.host_coordenador_id).toBe(membroHost.pessoa_id)
    expect(proj.host_coordenador_id).toBe(UID_COORD_DIREITO)
    await db.close()
  })

  // ── C-B1: membro sem indicação ativa rejeitado ────────────────────────────
  it('C-B1: membro com indicacao_id inválido (sem indicação ativa) é rejeitado', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    // Apenas coord_direito se indica; UID_ALUNO2 não tem indicação
    await indicarComoCoord(db, UID_COORD_DIREITO, projetoId)
    const indCoordId = await getIndicacaoId(db, UID_COORD_DIREITO, projetoId)
    const fakeIndId = '88888888-8888-8888-8888-888888888888'

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    expect(await negado(
      db.query(`select public.fechar_equipe(
        '${projetoId}',
        '${UID_COORD_DIREITO}',
        '[
          {"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indCoordId}"},
          {"pessoa_id":"${UID_ALUNO2}","papel_projeto":"aluno","indicacao_id":"${fakeIndId}"}
        ]'
      )`)
    ), 'membro com indicação inválida deve ser rejeitado').toBe(true)
    await db.close()
  })

  // ── RN9: janela fechada (projeto fora de em_analise) negado ─────────────
  it('RN9: fechar_equipe é negado se projeto não está em em_analise (janela fechada)', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    // Indica e fecha
    await indicarComoCoord(db, UID_COORD_DIREITO, projetoId)
    const indId = await getIndicacaoId(db, UID_COORD_DIREITO, projetoId)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe(
      '${projetoId}',
      '${UID_COORD_DIREITO}',
      '[{"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indId}"}]'
    )`)

    // Projeto agora está 'aprovado' — tenta fechar de novo
    // Precisa de outra indicação ativa (simula) mas o projeto já fechou a janela
    // Não há mais indicações ativas para inserir (status sai de em_analise → janela fechada)
    expect(await negado(
      db.query(`select public.fechar_equipe(
        '${projetoId}',
        '${UID_COORD_DIREITO}',
        '[{"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indId}"}]'
      )`)
    ), 'segunda chamada de fechar_equipe deve ser negada (janela fechada)').toBe(true)
    await db.close()
  })

  // ── RS10: is_dor_course_coordinator com PONTE via curso ──────────────────
  it('RS10: is_dor_course_coordinator reconhece coordenador do curso da dor via ponte curso', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    // Dor com curso 'direito'; UID_COORD_DIREITO é coordenador de 'direito'
    const { projetoId } = await publicarProjeto(db, { cursoSlug: 'direito' })

    // UID_COORD_DIREITO deve ser reconhecido como coordenador do curso da dor
    await comoUsuario(db, { uid: UID_COORD_DIREITO })
    const result = (await db.query<{ is_coord: boolean }>(
      `select public.is_dor_course_coordinator('${projetoId}') as is_coord`
    )).rows[0]!
    expect(result.is_coord, 'coord do curso da dor deve ser reconhecido').toBe(true)

    await db.close()
  })

  it('RS10: is_dor_course_coordinator NÃO reconhece coordenador de curso não relacionado à dor', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    // Dor com curso 'direito'; UID_COORD_OUTRO é coord de 'administracao' (não relacionado)
    const { projetoId } = await publicarProjeto(db, { cursoSlug: 'direito' })

    await comoUsuario(db, { uid: UID_COORD_OUTRO })
    const result = (await db.query<{ is_coord: boolean }>(
      `select public.is_dor_course_coordinator('${projetoId}') as is_coord`
    )).rows[0]!
    expect(result.is_coord, 'coord de curso não relacionado NÃO deve ser reconhecido').toBe(false)

    await db.close()
  })

  // ── zzz_audit disparado em membro_equipe ─────────────────────────────────
  it('trigger zzz_audit grava versão no INSERT de membro_equipe', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await indicarComoCoord(db, UID_COORD_DIREITO, projetoId)
    const indId = await getIndicacaoId(db, UID_COORD_DIREITO, projetoId)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe(
      '${projetoId}',
      '${UID_COORD_DIREITO}',
      '[{"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indId}"}]'
    )`)

    await db.exec('reset role')
    const cnt = (await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version
       where tabela = 'public.membro_equipe'`
    )).rows[0]!.n

    expect(cnt).toBeGreaterThan(0)
    await db.close()
  })

  // ── Helpers de escopo funcionam corretamente ──────────────────────────────
  it('is_project_host retorna true para o host e false para outros membros', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await indicarComoCoord(db, UID_COORD_DIREITO, projetoId)
    await indicarComoAluno(db, UID_ALUNO, projetoId)
    const indCoordId = await getIndicacaoId(db, UID_COORD_DIREITO, projetoId)
    const indAlunoId = await getIndicacaoId(db, UID_ALUNO, projetoId)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe(
      '${projetoId}',
      '${UID_COORD_DIREITO}',
      '[
        {"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indCoordId}"},
        {"pessoa_id":"${UID_ALUNO}","papel_projeto":"aluno","indicacao_id":"${indAlunoId}"}
      ]'
    )`)

    // Testa is_project_host
    await comoUsuario(db, { uid: UID_COORD_DIREITO })
    const isHost = (await db.query<{ r: boolean }>(
      `select public.is_project_host('${projetoId}') r`
    )).rows[0]!.r
    expect(isHost).toBe(true)

    await comoUsuario(db, { uid: UID_ALUNO })
    const isHostAluno = (await db.query<{ r: boolean }>(
      `select public.is_project_host('${projetoId}') r`
    )).rows[0]!.r
    expect(isHostAluno).toBe(false)

    await db.close()
  })

  it('is_team_member retorna true para qualquer membro e false para não-membro', async () => {
    const db = await novoBanco({ ate: '0033_membro_equipe_fechar.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await indicarComoCoord(db, UID_COORD_DIREITO, projetoId)
    const indCoordId = await getIndicacaoId(db, UID_COORD_DIREITO, projetoId)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.fechar_equipe(
      '${projetoId}',
      '${UID_COORD_DIREITO}',
      '[{"pessoa_id":"${UID_COORD_DIREITO}","papel_projeto":"host","indicacao_id":"${indCoordId}"}]'
    )`)

    await comoUsuario(db, { uid: UID_COORD_DIREITO })
    const isMember = (await db.query<{ r: boolean }>(
      `select public.is_team_member('${projetoId}') r`
    )).rows[0]!.r
    expect(isMember).toBe(true)

    await comoUsuario(db, { uid: UID_ALUNO2 })
    const isNotMember = (await db.query<{ r: boolean }>(
      `select public.is_team_member('${projetoId}') r`
    )).rows[0]!.r
    expect(isNotMember).toBe(false)

    await db.close()
  })
})
