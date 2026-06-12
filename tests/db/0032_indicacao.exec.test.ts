// @vitest-environment node
// T-O1.3 — tabela indicacao + RPCs indicar_se / retirar_indicacao
// RN4, RN5, RN6, RN7, RN8, RN9 · CA3, CA4, CA5, CA6, CA7, CA8 · RS1, RS3
import { describe, it, expect } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

const UID_ALUNO = '00000000-0000-0000-0000-000000000001'
const UID_COORD = '00000000-0000-0000-0000-000000000002'
const UID_ALUNO2 = '00000000-0000-0000-0000-000000000003'
const UID_ADM = '00000000-0000-0000-0000-000000000004'
const UID_NAO_VERIF = '00000000-0000-0000-0000-000000000005'

/** Semeia users, empresa, admin, cursos e coordenador */
async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_ALUNO}',      'aluno@ubm.br'),
      ('${UID_COORD}',      'coord@ubm.br'),
      ('${UID_ALUNO2}',     'aluno2@ubm.br'),
      ('${UID_ADM}',        'admin@ubm.br'),
      ('${UID_NAO_VERIF}',  'naoverif@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('EmpresaTeste', '${UID_ALUNO}');
    -- Verifica aluno, coord, aluno2 (não verifica UID_NAO_VERIF)
    update public.perfil set verificado_em = now()
      where user_id in ('${UID_ALUNO}', '${UID_COORD}', '${UID_ALUNO2}');
    -- Curso e coordenador (para CA4/RN5 — coord de qualquer curso pode indicar)
    insert into public.curso(id, slug, nome) values
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'direito', 'Direito');
    insert into public.coordenador_curso(user_id, curso_id) values
      ('${UID_COORD}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

/** Publica uma dor e retorna {dorId, projetoId}. Usa o curso fornecido (ou nenhum). */
async function publicarProjeto(
  db: import('@electric-sql/pglite').PGlite,
  opts: { cursoSlug?: string } = {}
): Promise<{ dorId: string; projetoId: string }> {
  const eid = await empId(db)
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id, empresa_id, status_dor, descricao, rep_nome, consentimento, consent_version, consent_at)
     values ('${UID_ALUNO}', '${eid}', 'em_moderacao', 'Dor teste 032', 'Rep A', true, 'v1', now()) returning id`
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

describe('0032 indicacao — tabela + RPCs indicar_se/retirar_indicacao', () => {

  // ── Estrutura da tabela ──────────────────────────────────────────────────
  it('indicacao tem RLS enable+force (RS1)', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })

    const rows = (await db.query<{ rls: boolean; force: boolean }>(
      `select relrowsecurity as rls, relforcerowsecurity as force
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and relname = 'indicacao'`
    )).rows

    expect(rows).toHaveLength(1)
    expect(rows[0]!.rls).toBe(true)
    expect(rows[0]!.force).toBe(true)
    await db.close()
  })

  it('indicacao tem colunas obrigatórias (projeto_id, pessoa_id, papel_pretendido, mensagem, soft-delete)', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })

    const cols = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'indicacao'`
    )).rows.map(r => r.column_name)

    expect(cols).toContain('id')
    expect(cols).toContain('projeto_id')
    expect(cols).toContain('pessoa_id')
    expect(cols).toContain('papel_pretendido')
    expect(cols).toContain('mensagem')
    expect(cols).toContain('created_at')
    expect(cols).toContain('deleted_at')
    await db.close()
  })

  it('uq_indicacao_pessoa_projeto existe como índice único parcial (where deleted_at is null)', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })

    const rows = (await db.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
       where schemaname = 'public' and tablename = 'indicacao'
         and indexname = 'uq_indicacao_pessoa_projeto'`
    )).rows

    expect(rows).toHaveLength(1)
    expect(rows[0]!.indexdef.toLowerCase()).toContain('where')
    expect(rows[0]!.indexdef.toLowerCase()).toContain('deleted_at is null')
    await db.close()
  })

  // ── CA3/RN4: aluno verificado indica a si mesmo ──────────────────────────
  it('CA3/RN4: aluno verificado pode indicar-se (papel_pretendido=aluno)', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await comoUsuario(db, { uid: UID_ALUNO })
    await db.query(
      `select public.indicar_se('${projetoId}', 'aluno', 'Quero participar')`
    )

    await comoServiceRole(db)
    const rows = (await db.query<{ pessoa_id: string; papel_pretendido: string }>(
      `select pessoa_id::text, papel_pretendido::text from public.indicacao
       where projeto_id = '${projetoId}' and deleted_at is null`
    )).rows

    expect(rows).toHaveLength(1)
    expect(rows[0]!.pessoa_id).toBe(UID_ALUNO)
    expect(rows[0]!.papel_pretendido).toBe('aluno')
    await db.close()
  })

  // ── CA4/RN5: coordenador de qualquer curso indica-se como coordenador ────
  it('CA4/RN5: coordenador de qualquer curso pode indicar-se (papel_pretendido=coordenador)', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    // Projeto com curso 'medicina_veterinaria' — diferente do curso do coord ('direito')
    const { projetoId } = await publicarProjeto(db, { cursoSlug: 'medicina_veterinaria' })

    await comoUsuario(db, { uid: UID_COORD })
    await db.query(
      `select public.indicar_se('${projetoId}', 'coordenador', 'Coordenador disposto')`
    )

    await comoServiceRole(db)
    const rows = (await db.query<{ pessoa_id: string; papel_pretendido: string }>(
      `select pessoa_id::text, papel_pretendido::text from public.indicacao
       where projeto_id = '${projetoId}' and deleted_at is null`
    )).rows

    expect(rows).toHaveLength(1)
    expect(rows[0]!.pessoa_id).toBe(UID_COORD)
    expect(rows[0]!.papel_pretendido).toBe('coordenador')
    await db.close()
  })

  // ── CA5/RN6: sem limite — múltiplas pessoas podem indicar-se ────────────
  it('CA5/RN6: sem limite — múltiplas pessoas verificadas podem indicar-se ao mesmo projeto', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await comoUsuario(db, { uid: UID_ALUNO })
    await db.query(`select public.indicar_se('${projetoId}', 'aluno', null)`)

    await comoUsuario(db, { uid: UID_ALUNO2 })
    await db.query(`select public.indicar_se('${projetoId}', 'aluno', null)`)

    await comoUsuario(db, { uid: UID_COORD })
    await db.query(`select public.indicar_se('${projetoId}', 'coordenador', null)`)

    await comoServiceRole(db)
    const cnt = (await db.query<{ n: number }>(
      `select count(*)::int n from public.indicacao
       where projeto_id = '${projetoId}' and deleted_at is null`
    )).rows[0]!.n

    expect(cnt).toBe(3)
    await db.close()
  })

  // ── CA6/RN7: 2ª indicação ativa é negada (uq_indicacao_pessoa_projeto) ──
  it('CA6/RN7: segunda indicação ativa da mesma pessoa no mesmo projeto é negada', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await comoUsuario(db, { uid: UID_ALUNO })
    await db.query(`select public.indicar_se('${projetoId}', 'aluno', null)`)

    // Segunda tentativa deve falhar
    expect(await negado(
      db.query(`select public.indicar_se('${projetoId}', 'coordenador', null)`)
    ), 'segunda indicação ativa deve ser negada pela uq parcial').toBe(true)
    await db.close()
  })

  // ── RN7: retirar→reindicar funciona ───────────────────────────────────────
  it('RN7: após retirar indicação (soft-delete) é possível reindicar-se', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await comoUsuario(db, { uid: UID_ALUNO })
    await db.query(`select public.indicar_se('${projetoId}', 'aluno', null)`)
    await db.query(`select public.retirar_indicacao('${projetoId}')`)

    // Após retirar, pode reindicar
    await db.query(`select public.indicar_se('${projetoId}', 'coordenador', null)`)

    await comoServiceRole(db)
    const ativas = (await db.query<{ n: number }>(
      `select count(*)::int n from public.indicacao
       where projeto_id = '${projetoId}' and pessoa_id = '${UID_ALUNO}' and deleted_at is null`
    )).rows[0]!.n

    expect(ativas).toBe(1)

    const todas = (await db.query<{ n: number }>(
      `select count(*)::int n from public.indicacao
       where projeto_id = '${projetoId}' and pessoa_id = '${UID_ALUNO}'`
    )).rows[0]!.n

    // Soft-delete: linha original permanece com deleted_at preenchido
    expect(todas).toBe(2)
    await db.close()
  })

  // ── CA7/RN8: não-verificado é negado ────────────────────────────────────
  it('CA7/RN8: usuário não-verificado não pode indicar-se', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await comoUsuario(db, { uid: UID_NAO_VERIF })
    expect(await negado(
      db.query(`select public.indicar_se('${projetoId}', 'aluno', null)`)
    ), 'não-verificado deve ser negado em indicar_se').toBe(true)
    await db.close()
  })

  // ── CA8/RN9: projeto fora de em_analise é negado ─────────────────────────
  it('CA8/RN9: indicação negada quando projeto não está em em_analise (ex: aprovado)', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    // Força o projeto para 'aprovado' via admin (contornando a guarda para setup)
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(
      `update public.projeto
       set status = 'aprovado',
           host_coordenador_id = '${UID_COORD}',
           aprovado_em = now()
       where id = '${projetoId}'`
    )

    await comoUsuario(db, { uid: UID_ALUNO })
    expect(await negado(
      db.query(`select public.indicar_se('${projetoId}', 'aluno', null)`)
    ), 'indicação fora de em_analise deve ser negada').toBe(true)
    await db.close()
  })

  // ── RS3: indicar_se impõe pessoa_id = auth.uid() (não indicar terceiros) ──
  it('RS3: indicar_se impõe pessoa_id = auth.uid() — não é possível indicar outro usuário', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    // UID_ALUNO chama indicar_se — deve criar indicação com pessoa_id = UID_ALUNO
    await comoUsuario(db, { uid: UID_ALUNO })
    await db.query(`select public.indicar_se('${projetoId}', 'aluno', null)`)

    await comoServiceRole(db)
    const rows = (await db.query<{ pessoa_id: string }>(
      `select pessoa_id::text from public.indicacao
       where projeto_id = '${projetoId}' and deleted_at is null`
    )).rows

    // A indicação deve ter pessoa_id = UID_ALUNO (quem chamou), não qualquer outro
    expect(rows).toHaveLength(1)
    expect(rows[0]!.pessoa_id).toBe(UID_ALUNO)
    await db.close()
  })

  // ── retirar_indicacao: soft-delete da própria ─────────────────────────────
  it('retirar_indicacao faz soft-delete (deleted_at preenchido, linha permanece)', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await comoUsuario(db, { uid: UID_ALUNO })
    await db.query(`select public.indicar_se('${projetoId}', 'aluno', null)`)
    await db.query(`select public.retirar_indicacao('${projetoId}')`)

    await comoServiceRole(db)
    const rows = (await db.query<{ deleted_at: string | null }>(
      `select deleted_at from public.indicacao
       where projeto_id = '${projetoId}' and pessoa_id = '${UID_ALUNO}'`
    )).rows

    expect(rows).toHaveLength(1)
    expect(rows[0]!.deleted_at).not.toBeNull()
    await db.close()
  })

  // ── zzz_audit disparado ───────────────────────────────────────────────────
  it('trigger zzz_audit grava versão no INSERT de indicacao', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await comoUsuario(db, { uid: UID_ALUNO })
    await db.query(`select public.indicar_se('${projetoId}', 'aluno', null)`)

    await db.exec('reset role')
    const cnt = (await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version
       where tabela = 'public.indicacao'`
    )).rows[0]!.n

    expect(cnt).toBeGreaterThan(0)
    await db.close()
  })

  // ── INSERT direto em indicacao é negado a authenticated ──────────────────
  it('INSERT direto em indicacao por authenticated é negado (só via RPC)', async () => {
    const db = await novoBanco({ ate: '0032_indicacao.sql' })
    await seedBase(db)
    const { projetoId } = await publicarProjeto(db)

    await comoUsuario(db, { uid: UID_ALUNO })
    expect(await negado(
      db.query(
        `insert into public.indicacao(projeto_id, pessoa_id, papel_pretendido)
         values ('${projetoId}', '${UID_ALUNO}', 'aluno')`
      )
    ), 'INSERT direto deve ser negado — só via RPC indicar_se').toBe(true)
    await db.close()
  })
})
