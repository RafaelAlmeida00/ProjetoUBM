// @vitest-environment node
// T-B10 PGlite — migração 0057: coordenador 1:N via slugs + conceder_representante + conceder_papel bloqueia representante
// Cobre:
//   §1 onboarding_coordenador(p_curso_slugs curso_ubm[], p_nome text) — self-service multi-curso
//   §2 conceder_coordenador(p_user_id uuid, p_curso_slugs curso_ubm[]) — admin-only multi-slug
//   §3 conceder_representante(p_user_id uuid, p_empresa_id uuid) — admin-only
//   §4 conceder_papel recriada: bloqueia 'coordenador' E 'representante'
//   §H HARDENING: anon bloqueado em todas as RPCs alteradas
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, comoAnon, negado } from './_pglite/harness'

// ── UUIDs fixos por contexto ─────────────────────────────────────────────────
const UID_ADM    = '57000000-0000-0000-0000-000000000001'
const UID_COORD  = '57000000-0000-0000-0000-000000000002'
const UID_USR    = '57000000-0000-0000-0000-000000000003'
const UID_REPR   = '57000000-0000-0000-0000-000000000004'
const UID_NOADM  = '57000000-0000-0000-0000-000000000005'

// cursos criados no seed
const CURSO_DIR_ID   = '57000000-0000-0000-0000-000000000010'
const CURSO_FAR_ID   = '57000000-0000-0000-0000-000000000011'
const CURSO_DIR_SLUG = 'direito'
const CURSO_FAR_SLUG = 'farmacia'

// empresa criada no seed
const EMP_ID = '57000000-0000-0000-0000-000000000020'

// ── Seed base ────────────────────────────────────────────────────────────────
async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_ADM}',   'admin57@ubm.br'),
      ('${UID_COORD}', 'coord57@ubm.br'),
      ('${UID_USR}',   'user57@ubm.br'),
      ('${UID_REPR}',  'repr57@empresa.com'),
      ('${UID_NOADM}', 'noadm57@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.curso(id, slug, nome) values
      ('${CURSO_DIR_ID}', '${CURSO_DIR_SLUG}', 'Direito'),
      ('${CURSO_FAR_ID}', '${CURSO_FAR_SLUG}', 'Farmácia');
    insert into public.empresa(id, nome_canonico, created_by)
      values ('${EMP_ID}', 'Empresa Teste 57', '${UID_ADM}');
  `)
}

// ── Helpers de role ──────────────────────────────────────────────────────────
const asAdmin = (db: import('@electric-sql/pglite').PGlite) =>
  comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })

const asCoord = (db: import('@electric-sql/pglite').PGlite) =>
  comoUsuario(db, { uid: UID_COORD, appMeta: { is_admin: false } })

const asNoAdm = (db: import('@electric-sql/pglite').PGlite) =>
  comoUsuario(db, { uid: UID_NOADM, appMeta: { is_admin: false } })

// ══════════════════════════════════════════════════════════════════════════════
// §H — HARDENING: anon não executa nenhuma das RPCs alteradas/novas
// ══════════════════════════════════════════════════════════════════════════════
describe('0057 §H — anon bloqueado em todas as RPCs novas/recriadas', () => {
  it('anon → onboarding_coordenador (slugs) → lança', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(
      db.query(`select public.onboarding_coordenador($1::public.curso_ubm[], $2)`,
        [`{${CURSO_DIR_SLUG}}`, 'Coord Anon'])
    )).toBe(true)
    await db.close()
  })

  it('anon → conceder_coordenador (slugs) → lança', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(
      db.query(`select public.conceder_coordenador($1, $2::public.curso_ubm[])`,
        [UID_USR, `{${CURSO_DIR_SLUG}}`])
    )).toBe(true)
    await db.close()
  })

  it('anon → conceder_representante → lança', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(
      db.query(`select public.conceder_representante($1, $2)`, [UID_REPR, EMP_ID])
    )).toBe(true)
    await db.close()
  })

  it('anon → conceder_papel → lança', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(
      db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'aluno'])
    )).toBe(true)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// §1 — onboarding_coordenador(p_curso_slugs curso_ubm[], p_nome text)
// ══════════════════════════════════════════════════════════════════════════════
describe('0057 §1 — onboarding_coordenador com slugs (1:N)', () => {
  it('coordenador self-service → 2 slugs → 2 vínculos pendentes em coordenador_curso', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asCoord(db)
    await db.query(
      `select public.onboarding_coordenador($1::public.curso_ubm[], $2)`,
      [`{${CURSO_DIR_SLUG},${CURSO_FAR_SLUG}}`, 'Coord Multi']
    )
    await comoServiceRole(db)
    const rows = (await db.query<{ curso_id: string; aprovado: boolean }>(
      `select curso_id::text, aprovado from public.coordenador_curso where user_id = $1 order by curso_id`,
      [UID_COORD]
    )).rows
    expect(rows.length, '2 vínculos criados').toBe(2)
    expect(rows.every(r => r.aprovado === false), 'todos pendentes (fail-closed)').toBe(true)
    await db.close()
  })

  it('onboarding_coordenador → 1 slug → 1 vínculo pendente', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asCoord(db)
    await db.query(
      `select public.onboarding_coordenador($1::public.curso_ubm[], $2)`,
      [`{${CURSO_DIR_SLUG}}`, 'Coord Um']
    )
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.coordenador_curso where user_id = $1`,
      [UID_COORD]
    )).rows
    expect(rows[0]!.c).toBe(1)
    await db.close()
  })

  it('onboarding_coordenador → concede papel coordenador no papel_usuario', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asCoord(db)
    await db.query(
      `select public.onboarding_coordenador($1::public.curso_ubm[], $2)`,
      [`{${CURSO_DIR_SLUG}}`, 'Coord Nome']
    )
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.papel_usuario where user_id = $1 and role = 'coordenador'`,
      [UID_COORD]
    )).rows
    expect(rows[0]!.c, 'papel coordenador concedido').toBe(1)
    await db.close()
  })

  it('onboarding_coordenador → grava nome_publico no perfil', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asCoord(db)
    await db.query(
      `select public.onboarding_coordenador($1::public.curso_ubm[], $2)`,
      [`{${CURSO_DIR_SLUG}}`, 'Nome Coord 57']
    )
    await comoServiceRole(db)
    const rows = (await db.query<{ nome_publico: string }>(
      `select nome_publico from public.perfil where user_id = $1`,
      [UID_COORD]
    )).rows
    expect(rows[0]?.nome_publico).toBe('Nome Coord 57')
    await db.close()
  })

  it('onboarding_coordenador idempotente — re-chamar mesmo slug não duplica vínculo', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asCoord(db)
    await db.query(
      `select public.onboarding_coordenador($1::public.curso_ubm[], $2)`,
      [`{${CURSO_DIR_SLUG}}`, 'Coord Idem']
    )
    await db.query(
      `select public.onboarding_coordenador($1::public.curso_ubm[], $2)`,
      [`{${CURSO_DIR_SLUG}}`, 'Coord Idem']
    )
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.coordenador_curso where user_id = $1 and curso_id = $2`,
      [UID_COORD, CURSO_DIR_ID]
    )).rows
    expect(rows[0]!.c, 'on conflict do nothing — sem duplicata').toBe(1)
    await db.close()
  })

  it('onboarding_coordenador sem sessão → raise autenticacao obrigatoria', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(
      db.query(`select public.onboarding_coordenador($1::public.curso_ubm[], $2)`,
        [`{${CURSO_DIR_SLUG}}`, 'X'])
    )).toBe(true)
    await db.close()
  })

  it('onboarding_coordenador sem nenhum slug válido → raise', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asCoord(db)
    // 'nao_sei' é valor do enum curso_ubm mas sem curso cadastrado com esse slug no seed
    expect(await negado(
      db.query(`select public.onboarding_coordenador($1::public.curso_ubm[], $2)`,
        ['{nao_sei}', 'Coord Invalido'])
    )).toBe(true)
    await db.close()
  })

  it('não preserva aprovado=true ao re-chamar (on conflict do nothing protege já-aprovado)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // seed um vínculo já aprovado
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado) values ($1, $2, true)`,
      [UID_COORD, CURSO_DIR_ID]
    )
    await asCoord(db)
    await db.query(
      `select public.onboarding_coordenador($1::public.curso_ubm[], $2)`,
      [`{${CURSO_DIR_SLUG}}`, 'Coord Reenvia']
    )
    await comoServiceRole(db)
    const rows = (await db.query<{ aprovado: boolean }>(
      `select aprovado from public.coordenador_curso where user_id = $1 and curso_id = $2`,
      [UID_COORD, CURSO_DIR_ID]
    )).rows
    expect(rows[0]?.aprovado, 'aprovado=true preservado (on conflict do nothing)').toBe(true)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// §2 — conceder_coordenador(p_user_id uuid, p_curso_slugs curso_ubm[]) admin-only
// ══════════════════════════════════════════════════════════════════════════════
describe('0057 §2 — conceder_coordenador admin-only com slugs', () => {
  it('admin concede coordenador 2 slugs → 2 vínculos aprovados=true com aprovado_por', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(
      `select public.conceder_coordenador($1, $2::public.curso_ubm[])`,
      [UID_USR, `{${CURSO_DIR_SLUG},${CURSO_FAR_SLUG}}`]
    )
    await comoServiceRole(db)
    const rows = (await db.query<{ curso_id: string; aprovado: boolean; aprovado_por: string }>(
      `select curso_id::text, aprovado, aprovado_por::text from public.coordenador_curso where user_id = $1 order by curso_id`,
      [UID_USR]
    )).rows
    expect(rows.length, '2 vínculos criados').toBe(2)
    expect(rows.every(r => r.aprovado === true), 'todos aprovados=true (admin autoridade)').toBe(true)
    expect(rows.every(r => r.aprovado_por === UID_ADM), 'aprovado_por = uid admin').toBe(true)
    await db.close()
  })

  it('admin concede coordenador → papel_usuario coordenador inserido', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(
      `select public.conceder_coordenador($1, $2::public.curso_ubm[])`,
      [UID_USR, `{${CURSO_DIR_SLUG}}`]
    )
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.papel_usuario where user_id = $1 and role = 'coordenador'`,
      [UID_USR]
    )).rows
    expect(rows[0]!.c, 'papel coordenador concedido').toBe(1)
    await db.close()
  })

  it('conceder_coordenador re-concede vínculo pendente → atualiza aprovado=true', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(`insert into public.papel_usuario(user_id, role) values ($1, 'coordenador')`, [UID_USR])
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado) values ($1, $2, false)`,
      [UID_USR, CURSO_DIR_ID]
    )
    await asAdmin(db)
    await db.query(
      `select public.conceder_coordenador($1, $2::public.curso_ubm[])`,
      [UID_USR, `{${CURSO_DIR_SLUG}}`]
    )
    await comoServiceRole(db)
    const rows = (await db.query<{ aprovado: boolean; aprovado_por: string }>(
      `select aprovado, aprovado_por::text from public.coordenador_curso where user_id = $1 and curso_id = $2`,
      [UID_USR, CURSO_DIR_ID]
    )).rows
    expect(rows[0]?.aprovado, 'pendente → aprovado=true').toBe(true)
    expect(rows[0]?.aprovado_por, 'aprovado_por = uid admin').toBe(UID_ADM)
    await db.close()
  })

  it('não-admin → conceder_coordenador (slugs) → forbidden', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asNoAdm(db)
    expect(await negado(
      db.query(`select public.conceder_coordenador($1, $2::public.curso_ubm[])`,
        [UID_USR, `{${CURSO_DIR_SLUG}}`])
    )).toBe(true)
    await db.close()
  })

  it('conceder_coordenador com 0 slugs válidos → raise', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    // 'nao_sei' está no enum mas sem curso no seed
    expect(await negado(
      db.query(`select public.conceder_coordenador($1, $2::public.curso_ubm[])`,
        [UID_USR, '{nao_sei}'])
    )).toBe(true)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// §3 — conceder_representante(p_user_id uuid, p_empresa_id uuid) admin-only
// ══════════════════════════════════════════════════════════════════════════════
describe('0057 §3 — conceder_representante admin-only', () => {
  it('admin concede representante → papel_usuario representante + membro_empresa', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(`select public.conceder_representante($1, $2)`, [UID_REPR, EMP_ID])
    await comoServiceRole(db)
    const papel = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.papel_usuario where user_id = $1 and role = 'representante'`,
      [UID_REPR]
    )).rows[0]!.c
    const membro = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.membro_empresa where user_id = $1 and empresa_id = $2`,
      [UID_REPR, EMP_ID]
    )).rows[0]!.c
    expect(papel, 'papel representante inserido em papel_usuario').toBe(1)
    expect(membro, 'linha em membro_empresa criada').toBe(1)
    await db.close()
  })

  it('membro_empresa criado via conceder_representante tem papel=representante', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(`select public.conceder_representante($1, $2)`, [UID_REPR, EMP_ID])
    await comoServiceRole(db)
    const rows = (await db.query<{ papel: string }>(
      `select papel::text from public.membro_empresa where user_id = $1 and empresa_id = $2`,
      [UID_REPR, EMP_ID]
    )).rows
    expect(rows[0]?.papel, 'papel=representante na membro_empresa').toBe('representante')
    await db.close()
  })

  it('conceder_representante é idempotente (on conflict do nothing)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(`select public.conceder_representante($1, $2)`, [UID_REPR, EMP_ID])
    await db.query(`select public.conceder_representante($1, $2)`, [UID_REPR, EMP_ID]) // 2a chamada
    await comoServiceRole(db)
    const membro = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.membro_empresa where user_id = $1 and empresa_id = $2`,
      [UID_REPR, EMP_ID]
    )).rows[0]!.c
    expect(membro, 'on conflict do nothing — sem duplicata').toBe(1)
    await db.close()
  })

  it('não-admin → conceder_representante → forbidden', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asNoAdm(db)
    expect(await negado(
      db.query(`select public.conceder_representante($1, $2)`, [UID_REPR, EMP_ID])
    )).toBe(true)
    await db.close()
  })

  it('conceder_representante → empresa inexistente → raise', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const UUID_INEXISTENTE = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    expect(await negado(
      db.query(`select public.conceder_representante($1, $2)`, [UID_REPR, UUID_INEXISTENTE])
    )).toBe(true)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// §4 — conceder_papel recriada: bloqueia coordenador E representante
// ══════════════════════════════════════════════════════════════════════════════
describe('0057 §4 — conceder_papel bloqueia coordenador e representante', () => {
  it('conceder_papel(coordenador) → raise (força conceder_coordenador)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    expect(await negado(
      db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'coordenador'])
    )).toBe(true)
    await db.close()
  })

  it('conceder_papel(representante) → raise (força conceder_representante com empresa)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    expect(await negado(
      db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'representante'])
    )).toBe(true)
    await db.close()
  })

  it('conceder_papel(aluno) → ainda funciona normalmente', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await expect(
      db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'aluno'])
    ).resolves.toBeDefined()
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.papel_usuario where user_id = $1 and role = 'aluno'`,
      [UID_USR]
    )).rows
    expect(rows[0]!.c).toBe(1)
    await db.close()
  })

  it('não-admin → conceder_papel → forbidden (gate is_admin intacto)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asNoAdm(db)
    expect(await negado(
      db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'aluno'])
    )).toBe(true)
    await db.close()
  })
})
