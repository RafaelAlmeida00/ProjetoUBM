// @vitest-environment node
// T-B9 PGlite — migração 0055: admin gestão completa de usuários (Onda 2 / feature 005)
// security design: onda2-admin-gestao-usuarios-security.md (cybersecurity)
// Cobre §4 (VETO-conditions): anon bloqueado, não-admin → forbidden, guards banco
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, comoAnon, negado } from './_pglite/harness'

// ── UUIDs fixos por contexto ─────────────────────────────────────────────────
const UID_ADM     = '55000000-0000-0000-0000-000000000001'
const UID_ADM2    = '55000000-0000-0000-0000-000000000002' // segundo admin (para lockout test)
const UID_USR     = '55000000-0000-0000-0000-000000000003'
const UID_COORD   = '55000000-0000-0000-0000-000000000004'
const UID_NOADM   = '55000000-0000-0000-0000-000000000005' // authenticated não-admin
const CURSO_ID    = '55000000-0000-0000-0000-000000000010'
const CURSO2_ID   = '55000000-0000-0000-0000-000000000011'

// ── Seed base ────────────────────────────────────────────────────────────────
async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_ADM}',   'admin55@ubm.br'),
      ('${UID_ADM2}',  'admin55b@ubm.br'),
      ('${UID_USR}',   'user55@ubm.br'),
      ('${UID_COORD}', 'coord55@ubm.br'),
      ('${UID_NOADM}', 'noadm55@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.curso(id, slug, nome) values
      ('${CURSO_ID}',  'direito',  'Direito'),
      ('${CURSO2_ID}', 'farmacia', 'Farmácia');
  `)
}

// ── Helpers de role ──────────────────────────────────────────────────────────
const asAdmin  = (db: import('@electric-sql/pglite').PGlite) =>
  comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })

const asAdmin2 = (db: import('@electric-sql/pglite').PGlite) =>
  comoUsuario(db, { uid: UID_ADM2, appMeta: { is_admin: true } })

const asNoAdm  = (db: import('@electric-sql/pglite').PGlite) =>
  comoUsuario(db, { uid: UID_NOADM, appMeta: { is_admin: false } })

// ═══════════════════════════════════════════════════════════════════════════════
// §H — HARDENING: anon não executa NENHUMA das 6 RPCs
// ═══════════════════════════════════════════════════════════════════════════════
describe('0055 §H — anon não executa nenhuma RPC de gestão', () => {
  it('anon → conceder_admin lança', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(db.query(`select public.conceder_admin($1)`, [UID_USR]))).toBe(true)
    await db.close()
  })

  it('anon → revogar_admin lança', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(db.query(`select public.revogar_admin($1)`, [UID_USR]))).toBe(true)
    await db.close()
  })

  it('anon → revogar_papel lança', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(db.query(`select public.revogar_papel($1, $2::public.app_role)`, [UID_USR, 'aluno']))).toBe(true)
    await db.close()
  })

  it('anon → conceder_coordenador lança', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(db.query(`select public.conceder_coordenador($1, $2)`, [UID_USR, CURSO_ID]))).toBe(true)
    await db.close()
  })

  it('anon → admin_editar_perfil lança', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(db.query(`select public.admin_editar_perfil($1, $2)`, [UID_USR, 'Teste']))).toBe(true)
    await db.close()
  })

  it('anon → conceder_papel lança', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'aluno']))).toBe(true)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §G — authenticated não-admin → forbidden em todas
// ═══════════════════════════════════════════════════════════════════════════════
describe('0055 §G — authenticated não-admin → forbidden (gate is_admin)', () => {
  it('não-admin → conceder_admin → forbidden', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asNoAdm(db)
    expect(await negado(db.query(`select public.conceder_admin($1)`, [UID_USR]))).toBe(true)
    await db.close()
  })

  it('não-admin → revogar_admin → forbidden', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asNoAdm(db)
    expect(await negado(db.query(`select public.revogar_admin($1)`, [UID_ADM]))).toBe(true)
    await db.close()
  })

  it('não-admin → revogar_papel → forbidden', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // seed um papel para revogar
    await comoServiceRole(db)
    await db.query(`insert into public.papel_usuario(user_id, role) values ($1, 'aluno')`, [UID_USR])
    await asNoAdm(db)
    expect(await negado(db.query(`select public.revogar_papel($1, $2::public.app_role)`, [UID_USR, 'aluno']))).toBe(true)
    await db.close()
  })

  it('não-admin → conceder_coordenador → forbidden', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asNoAdm(db)
    expect(await negado(db.query(`select public.conceder_coordenador($1, $2)`, [UID_USR, CURSO_ID]))).toBe(true)
    await db.close()
  })

  it('não-admin → admin_editar_perfil → forbidden', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asNoAdm(db)
    expect(await negado(db.query(`select public.admin_editar_perfil($1, $2)`, [UID_USR, 'Teste']))).toBe(true)
    await db.close()
  })

  it('não-admin → conceder_papel → forbidden', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asNoAdm(db)
    expect(await negado(db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'aluno']))).toBe(true)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §1 — conceder_admin
// ═══════════════════════════════════════════════════════════════════════════════
describe('0055 §1 — conceder_admin', () => {
  it('admin concede admin → linha em admin_app', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(`select public.conceder_admin($1)`, [UID_USR])
    await comoServiceRole(db)
    const rows = (await db.query<{ user_id: string }>(
      `select user_id::text from public.admin_app where user_id = $1`, [UID_USR]
    )).rows
    expect(rows.length).toBe(1)
    await db.close()
  })

  it('conceder_admin é idempotente (on conflict do nothing)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(`select public.conceder_admin($1)`, [UID_USR])
    await db.query(`select public.conceder_admin($1)`, [UID_USR]) // segundo call
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.admin_app where user_id = $1`, [UID_USR]
    )).rows
    expect(rows[0]!.c).toBe(1)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §2 — revogar_admin (guard A: self-revoke; guard B: lockout)
// ═══════════════════════════════════════════════════════════════════════════════
describe('0055 §2 — revogar_admin', () => {
  it('admin revoga outro admin → remove linha de admin_app', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // seed segundo admin para não disparar lockout
    await comoServiceRole(db)
    await db.query(`insert into public.admin_app(user_id) values ($1)`, [UID_ADM2])
    await asAdmin(db)
    await db.query(`select public.revogar_admin($1)`, [UID_ADM2])
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.admin_app where user_id = $1`, [UID_ADM2]
    )).rows
    expect(rows[0]!.c).toBe(0)
    await db.close()
  })

  it('GUARD A — admin não pode revogar o próprio admin (self-revoke → raise)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // seed segundo admin para que count > 1 (isolar guard A do guard B)
    await comoServiceRole(db)
    await db.query(`insert into public.admin_app(user_id) values ($1)`, [UID_ADM2])
    await asAdmin(db)
    expect(await negado(db.query(`select public.revogar_admin($1)`, [UID_ADM]))).toBe(true)
    await db.close()
  })

  it('GUARD B — remover único admin → raise lockout (último admin protegido)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // seedBase insere só UID_ADM em admin_app → count = 1.
    // UID_ADM (o único admin) tenta revogar UID_USR (que não é admin).
    // Guard B checa: count(*) from admin_app = 1 <= 1 → raise lockout.
    // (guard A não dispara: p_user_id = UID_USR ≠ auth.uid() = UID_ADM)
    await asAdmin(db)
    expect(await negado(db.query(`select public.revogar_admin($1)`, [UID_USR]))).toBe(true)
    await db.close()
  })

  it('GUARD B — com dois admins, revogar um deles é permitido', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(`insert into public.admin_app(user_id) values ($1)`, [UID_ADM2])
    await asAdmin(db)
    // revoga ADM2 (sobram ADM: count vai de 2 → 1, mas guard B checa ANTES = 2 > 1 → OK)
    await expect(db.query(`select public.revogar_admin($1)`, [UID_ADM2])).resolves.toBeDefined()
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §3 — revogar_papel
// ═══════════════════════════════════════════════════════════════════════════════
describe('0055 §3 — revogar_papel', () => {
  it('admin revoga papel aluno → remove de papel_usuario', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(`insert into public.papel_usuario(user_id, role) values ($1, 'aluno')`, [UID_USR])
    await asAdmin(db)
    await db.query(`select public.revogar_papel($1, $2::public.app_role)`, [UID_USR, 'aluno'])
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.papel_usuario where user_id = $1 and role = 'aluno'`, [UID_USR]
    )).rows
    expect(rows[0]!.c).toBe(0)
    await db.close()
  })

  it('revogar_papel coordenador → também limpa coordenador_curso (atômico)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(`insert into public.papel_usuario(user_id, role) values ($1, 'coordenador')`, [UID_COORD])
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado) values ($1, $2, true)`,
      [UID_COORD, CURSO_ID]
    )
    await asAdmin(db)
    await db.query(`select public.revogar_papel($1, $2::public.app_role)`, [UID_COORD, 'coordenador'])
    await comoServiceRole(db)
    const papel = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.papel_usuario where user_id = $1 and role = 'coordenador'`, [UID_COORD]
    )).rows[0]!.c
    const vinculo = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.coordenador_curso where user_id = $1`, [UID_COORD]
    )).rows[0]!.c
    expect(papel, 'papel coordenador removido').toBe(0)
    expect(vinculo, 'coordenador_curso limpo atomicamente').toBe(0)
    await db.close()
  })

  it('revogar_papel representante → NÃO toca coordenador_curso', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(`insert into public.papel_usuario(user_id, role) values ($1, 'representante')`, [UID_COORD])
    await db.query(`insert into public.papel_usuario(user_id, role) values ($1, 'coordenador')`, [UID_COORD])
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado) values ($1, $2, true)`,
      [UID_COORD, CURSO_ID]
    )
    await asAdmin(db)
    await db.query(`select public.revogar_papel($1, $2::public.app_role)`, [UID_COORD, 'representante'])
    await comoServiceRole(db)
    const vinculo = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.coordenador_curso where user_id = $1`, [UID_COORD]
    )).rows[0]!.c
    expect(vinculo, 'coordenador_curso intacto ao revogar outro papel').toBe(1)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §4 — conceder_coordenador
// ═══════════════════════════════════════════════════════════════════════════════
describe('0055 §4 — conceder_coordenador', () => {
  it('admin concede coordenador → papel_usuario + coordenador_curso aprovado=true', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(`select public.conceder_coordenador($1, $2)`, [UID_USR, CURSO_ID])
    await comoServiceRole(db)
    const papel = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.papel_usuario where user_id = $1 and role = 'coordenador'`, [UID_USR]
    )).rows[0]!.c
    const cc = (await db.query<{ aprovado: boolean; aprovado_por: string }>(
      `select aprovado, aprovado_por::text from public.coordenador_curso where user_id = $1 and curso_id = $2`,
      [UID_USR, CURSO_ID]
    )).rows[0]
    expect(papel, 'papel coordenador concedido').toBe(1)
    expect(cc?.aprovado, 'aprovado=true (nasce aprovado por admin)').toBe(true)
    expect(cc?.aprovado_por, 'aprovado_por = uid do admin atuante').toBe(UID_ADM)
    await db.close()
  })

  it('conceder_coordenador → upsert: re-conceder atualiza aprovado_por e aprovado_em', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    // vínculo pendente preexistente (aprovado=false, criado pelo self-service)
    await db.query(`insert into public.papel_usuario(user_id, role) values ($1, 'coordenador')`, [UID_USR])
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado) values ($1, $2, false)`,
      [UID_USR, CURSO_ID]
    )
    await asAdmin(db)
    await db.query(`select public.conceder_coordenador($1, $2)`, [UID_USR, CURSO_ID])
    await comoServiceRole(db)
    const cc = (await db.query<{ aprovado: boolean; aprovado_por: string }>(
      `select aprovado, aprovado_por::text from public.coordenador_curso where user_id = $1 and curso_id = $2`,
      [UID_USR, CURSO_ID]
    )).rows[0]
    expect(cc?.aprovado).toBe(true)
    expect(cc?.aprovado_por).toBe(UID_ADM)
    await db.close()
  })

  it('conceder_coordenador → valida que curso existe (curso inexistente → raise)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const UUID_INEXISTENTE = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    expect(await negado(db.query(`select public.conceder_coordenador($1, $2)`, [UID_USR, UUID_INEXISTENTE]))).toBe(true)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §5 — conceder_papel (recriado: bloqueia coordenador, aceita aluno/representante)
// ═══════════════════════════════════════════════════════════════════════════════
describe('0055 §5 — conceder_papel bloqueio coordenador', () => {
  it('conceder_papel(coordenador) → raise (força caminho conceder_coordenador)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    expect(await negado(
      db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'coordenador'])
    )).toBe(true)
    await db.close()
  })

  it('conceder_papel(aluno) → OK (papel normal)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await expect(
      db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'aluno'])
    ).resolves.toBeDefined()
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.papel_usuario where user_id = $1 and role = 'aluno'`, [UID_USR]
    )).rows
    expect(rows[0]!.c).toBe(1)
    await db.close()
  })

  it('conceder_papel(representante) → OK (papel normal)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await expect(
      db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'representante'])
    ).resolves.toBeDefined()
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.papel_usuario where user_id = $1 and role = 'representante'`, [UID_USR]
    )).rows
    expect(rows[0]!.c).toBe(1)
    await db.close()
  })

  it('conceder_papel idempotente (on conflict do nothing)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'aluno'])
    await db.query(`select public.conceder_papel($1, $2::public.app_role)`, [UID_USR, 'aluno'])
    await comoServiceRole(db)
    const rows = (await db.query<{ c: number }>(
      `select count(*)::int as c from public.papel_usuario where user_id = $1 and role = 'aluno'`, [UID_USR]
    )).rows
    expect(rows[0]!.c).toBe(1)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §6 — admin_editar_perfil
// ═══════════════════════════════════════════════════════════════════════════════
describe('0055 §6 — admin_editar_perfil', () => {
  it('admin edita nome_publico de outro usuário → atualiza perfil', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(`select public.admin_editar_perfil($1, $2)`, [UID_USR, 'Nome Editado Admin'])
    await comoServiceRole(db)
    const rows = (await db.query<{ nome_publico: string }>(
      `select nome_publico from public.perfil where user_id = $1`, [UID_USR]
    )).rows
    expect(rows[0]?.nome_publico).toBe('Nome Editado Admin')
    await db.close()
  })

  it('admin_editar_perfil → nome vazio/curto → raise (whitelist: trim >= 2)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    expect(await negado(db.query(`select public.admin_editar_perfil($1, $2)`, [UID_USR, ' ']))).toBe(true)
    await db.close()
  })

  it('admin_editar_perfil → nome com 1 char → raise', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    expect(await negado(db.query(`select public.admin_editar_perfil($1, $2)`, [UID_USR, 'A']))).toBe(true)
    await db.close()
  })

  it('admin_editar_perfil → nome válido com espaços → salva trimmed', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    await db.query(`select public.admin_editar_perfil($1, $2)`, [UID_USR, '  Rafael Silva  '])
    await comoServiceRole(db)
    const rows = (await db.query<{ nome_publico: string }>(
      `select nome_publico from public.perfil where user_id = $1`, [UID_USR]
    )).rows
    expect(rows[0]?.nome_publico).toBe('Rafael Silva')
    await db.close()
  })
})
