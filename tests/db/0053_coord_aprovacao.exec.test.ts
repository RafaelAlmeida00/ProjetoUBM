// @vitest-environment node
// T-B7 PGlite — migração 0053: aprovação de coordenador (Onda 2 / feature 005)
// security design: onda2-coord-aprovacao-security.md (cybersecurity, VETO-1..4)
// Rastreab.: §1 colunas, §2 RPCs, §3 gate crítico (VETO-2), §4 RLS, §5 grants.
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, comoAnon, negado } from './_pglite/harness'

// ── UUIDs fixos por contexto ─────────────────────────────────────────────────
const UID_COORD   = '53000000-0000-0000-0000-000000000001'
const UID_COORD2  = '53000000-0000-0000-0000-000000000002'
const UID_ADM     = '53000000-0000-0000-0000-000000000003'
const UID_ALUNO   = '53000000-0000-0000-0000-000000000004'
const UID_OUTRO   = '53000000-0000-0000-0000-000000000005'
const CURSO_ID    = '53000000-0000-0000-0000-000000000010'
// direito: valor válido em curso_ubm enum (0001) e slug existente no catálogo de seed
const CURSO_SLUG  = 'direito'

// ── Seed base (usuários + curso + admin) ─────────────────────────────────────
async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_COORD}',  'coord@ubm.br'),
      ('${UID_COORD2}', 'coord2@ubm.br'),
      ('${UID_ADM}',    'admin@ubm.br'),
      ('${UID_ALUNO}',  'aluno@ubm.br'),
      ('${UID_OUTRO}',  'outro@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('EmpTeste53', '${UID_ALUNO}');
    -- autor da dor precisa estar verificado para dor_publicavel() → true
    update public.perfil set verificado_em = now(), nome_publico = 'Aluno Teste'
      where user_id = '${UID_ALUNO}';
    insert into public.curso(id, slug, nome)
      values ('${CURSO_ID}', '${CURSO_SLUG}', 'Direito');
  `)
}

// ── Seed projeto com dor linkada ao curso (para gates de coordenador) ─────────
async function seedProjeto(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  const empId = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  await comoServiceRole(db)
  const dorId = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id, empresa_id, status_dor, descricao, rep_nome, consentimento, consent_version, consent_at)
     values ('${UID_ALUNO}', '${empId}', 'em_moderacao', 'dor 53', 'Rep', true, 'v1', now()) returning id`
  )).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id, curso) values ('${dorId}', '${CURSO_SLUG}')`)
  await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}', 'aprovar', null)`)
  await comoServiceRole(db)
  const projetoId = (await db.query<{ id: string }>(
    `select id from public.projeto where dor_id = '${dorId}' limit 1`
  )).rows[0]!.id
  return projetoId
}

// ═══════════════════════════════════════════════════════════════════════════════
// §1 — Colunas novas em coordenador_curso
// ═══════════════════════════════════════════════════════════════════════════════
describe('0053 §1 — colunas aprovado / aprovado_por / aprovado_em', () => {
  it('coluna aprovado existe (boolean not null default false)', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ column_name: string; data_type: string; column_default: string; is_nullable: string }>(
      `select column_name, data_type, column_default, is_nullable
       from information_schema.columns
       where table_schema = 'public' and table_name = 'coordenador_curso' and column_name = 'aprovado'`
    )).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]!.data_type).toBe('boolean')
    expect(rows[0]!.is_nullable).toBe('NO')
    expect(rows[0]!.column_default).toContain('false')
    await db.close()
  })

  it('coluna aprovado_por existe (uuid nullable)', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ data_type: string; is_nullable: string }>(
      `select data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'coordenador_curso' and column_name = 'aprovado_por'`
    )).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]!.data_type).toBe('uuid')
    expect(rows[0]!.is_nullable).toBe('YES')
    await db.close()
  })

  it('coluna aprovado_em existe (timestamptz nullable)', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ data_type: string; is_nullable: string }>(
      `select data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'coordenador_curso' and column_name = 'aprovado_em'`
    )).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]!.is_nullable).toBe('YES')
    await db.close()
  })

  it('linhas legadas (inseridas antes da 0053) nascem com aprovado=false (fail closed — §6/VETO-1)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // Insere vínculo diretamente (simula legado) — service_role bypass RLS
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id) values ('${UID_COORD}', '${CURSO_ID}')`
    )
    const row = (await db.query<{ aprovado: boolean }>(
      `select aprovado from public.coordenador_curso where user_id = '${UID_COORD}'`
    )).rows[0]!
    expect(row.aprovado).toBe(false)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §2 — RPC onboarding_coordenador
// ═══════════════════════════════════════════════════════════════════════════════
describe('0053 §2 — RPC onboarding_coordenador', () => {
  it('RPC existe', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'onboarding_coordenador'`
    )).rows
    expect(rows).toHaveLength(1)
    await db.close()
  })

  it('self-service: insere vínculo com aprovado=FALSE (fail closed — VETO-3)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoUsuario(db, { uid: UID_COORD })
    await db.query(`select public.onboarding_coordenador(array['${CURSO_SLUG}']::public.curso_ubm[],'Prof. Engcomp')`)

    await comoServiceRole(db)
    const row = (await db.query<{ aprovado: boolean }>(
      `select aprovado from public.coordenador_curso where user_id = '${UID_COORD}' and curso_id = '${CURSO_ID}'`
    )).rows[0]!
    expect(row.aprovado).toBe(false)
    await db.close()
  })

  it('grava papel coordenador em papel_usuario', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoUsuario(db, { uid: UID_COORD })
    await db.query(`select public.onboarding_coordenador(array['${CURSO_SLUG}']::public.curso_ubm[],'Prof. Engcomp')`)

    await comoServiceRole(db)
    const rows = (await db.query<{ role: string }>(
      `select role::text from public.papel_usuario where user_id = '${UID_COORD}'`
    )).rows
    expect(rows.some(r => r.role === 'coordenador')).toBe(true)
    await db.close()
  })

  it('idempotente: re-chamada por já-aprovado NÃO rebaixa aprovado (VETO-3)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // Força aprovado=true diretamente (simula aprovação prévia)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', true)`
    )
    // Re-chama como o próprio usuário
    await comoUsuario(db, { uid: UID_COORD })
    await db.query(`select public.onboarding_coordenador(array['${CURSO_SLUG}']::public.curso_ubm[],'Prof. Engcomp')`)

    await comoServiceRole(db)
    const row = (await db.query<{ aprovado: boolean }>(
      `select aprovado from public.coordenador_curso where user_id = '${UID_COORD}' and curso_id = '${CURSO_ID}'`
    )).rows[0]!
    expect(row.aprovado).toBe(true) // não regrediu
    await db.close()
  })

  it('valida p_nome não-vazio (raise quando vazio)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoUsuario(db, { uid: UID_COORD })
    await expect(
      db.query(`select public.onboarding_coordenador(array['${CURSO_SLUG}']::public.curso_ubm[],'')`)
    ).rejects.toThrow()
    await db.close()
  })

  it('valida curso existente (raise quando nenhum slug resolve a curso)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // 0057: slug válido do enum mas SEM curso seedado (só 'direito' existe) → raise
    await comoUsuario(db, { uid: UID_COORD })
    await expect(
      db.query(`select public.onboarding_coordenador(array['engenharia_de_software']::public.curso_ubm[], 'Prof.')`)
    ).rejects.toThrow()
    await db.close()
  })

  it('não-autenticado (auth.uid() null) lança exceção', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    await expect(
      db.query(`select public.onboarding_coordenador(array['${CURSO_SLUG}']::public.curso_ubm[],'Prof.')`)
    ).rejects.toThrow()
    await db.close()
  })

  it('anon não tem execute na RPC (grant negado — §5)', async () => {
    const db = await novoBanco()
    const ok = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.onboarding_coordenador(curso_ubm[],text)', 'execute') ok`
    )).rows[0]!.ok
    expect(ok).toBe(false)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §2 — RPC aprovar_coordenador
// ═══════════════════════════════════════════════════════════════════════════════
describe('0053 §2 — RPC aprovar_coordenador', () => {
  it('RPC existe', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'aprovar_coordenador'`
    )).rows
    expect(rows).toHaveLength(1)
    await db.close()
  })

  it('admin aprova: set aprovado=true, aprovado_por, aprovado_em', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // Cria vínculo pendente via self-service
    await comoUsuario(db, { uid: UID_COORD })
    await db.query(`select public.onboarding_coordenador(array['${CURSO_SLUG}']::public.curso_ubm[],'Prof. Coord')`)

    // Admin aprova
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.aprovar_coordenador('${UID_COORD}', '${CURSO_ID}')`)

    await comoServiceRole(db)
    const row = (await db.query<{ aprovado: boolean; aprovado_por: string; aprovado_em: string }>(
      `select aprovado, aprovado_por::text, aprovado_em from public.coordenador_curso
       where user_id = '${UID_COORD}' and curso_id = '${CURSO_ID}'`
    )).rows[0]!
    expect(row.aprovado).toBe(true)
    expect(row.aprovado_por).toBe(UID_ADM)
    expect(row.aprovado_em).not.toBeNull()
    await db.close()
  })

  it('não-admin é barrado (gate is_admin() — VETO-4)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id) values ('${UID_COORD}', '${CURSO_ID}')`
    )
    await comoUsuario(db, { uid: UID_OUTRO })
    await expect(
      db.query(`select public.aprovar_coordenador('${UID_COORD}', '${CURSO_ID}')`)
    ).rejects.toThrow()
    await db.close()
  })

  it('idempotente: aprovar já-aprovado é no-op (predicado aprovado=false)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado, aprovado_por, aprovado_em)
       values ('${UID_COORD}', '${CURSO_ID}', true, '${UID_ADM}', now())`
    )
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    // Não deve lançar; deve ser no-op silencioso
    await expect(
      db.query(`select public.aprovar_coordenador('${UID_COORD}', '${CURSO_ID}')`)
    ).resolves.toBeDefined()
    await db.close()
  })

  it('anon não tem execute na RPC (grant negado — §5)', async () => {
    const db = await novoBanco()
    const ok = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.aprovar_coordenador(uuid,uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(ok).toBe(false)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §2 — RPCs recusar_coordenador e revogar_coordenador
// ═══════════════════════════════════════════════════════════════════════════════
describe('0053 §2 — RPCs recusar_coordenador e revogar_coordenador', () => {
  it('recusar_coordenador existe', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'recusar_coordenador'`
    )).rows
    expect(rows).toHaveLength(1)
    await db.close()
  })

  it('revogar_coordenador existe', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'revogar_coordenador'`
    )).rows
    expect(rows).toHaveLength(1)
    await db.close()
  })

  it('admin recusa pendente: remove a linha', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoUsuario(db, { uid: UID_COORD })
    await db.query(`select public.onboarding_coordenador(array['${CURSO_SLUG}']::public.curso_ubm[],'Prof.')`)

    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.recusar_coordenador('${UID_COORD}', '${CURSO_ID}')`)

    await comoServiceRole(db)
    const rows = (await db.query<{ user_id: string }>(
      `select user_id from public.coordenador_curso where user_id = '${UID_COORD}'`
    )).rows
    expect(rows).toHaveLength(0)
    await db.close()
  })

  it('recusar NÃO remove já-aprovado (só remove pendentes)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    // Insere como aprovado
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', true)`
    )
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.recusar_coordenador('${UID_COORD}', '${CURSO_ID}')`)

    await comoServiceRole(db)
    const rows = (await db.query<{ aprovado: boolean }>(
      `select aprovado from public.coordenador_curso where user_id = '${UID_COORD}'`
    )).rows
    // linha ainda existe (recusar não afeta aprovados)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.aprovado).toBe(true)
    await db.close()
  })

  it('admin revoga aprovado: remove a linha', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', true)`
    )
    await comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })
    await db.query(`select public.revogar_coordenador('${UID_COORD}', '${CURSO_ID}')`)

    await comoServiceRole(db)
    const rows = (await db.query<{ user_id: string }>(
      `select user_id from public.coordenador_curso where user_id = '${UID_COORD}'`
    )).rows
    expect(rows).toHaveLength(0)
    await db.close()
  })

  it('não-admin é barrado no recusar (VETO-4)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id) values ('${UID_COORD}', '${CURSO_ID}')`
    )
    await comoUsuario(db, { uid: UID_OUTRO })
    await expect(
      db.query(`select public.recusar_coordenador('${UID_COORD}', '${CURSO_ID}')`)
    ).rejects.toThrow()
    await db.close()
  })

  it('não-admin é barrado no revogar (VETO-4)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', true)`
    )
    await comoUsuario(db, { uid: UID_OUTRO })
    await expect(
      db.query(`select public.revogar_coordenador('${UID_COORD}', '${CURSO_ID}')`)
    ).rejects.toThrow()
    await db.close()
  })

  it('anon não tem execute em recusar_coordenador (§5)', async () => {
    const db = await novoBanco()
    const ok = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.recusar_coordenador(uuid,uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(ok).toBe(false)
    await db.close()
  })

  it('anon não tem execute em revogar_coordenador (§5)', async () => {
    const db = await novoBanco()
    const ok = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.revogar_coordenador(uuid,uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(ok).toBe(false)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §3 — GATE CRÍTICO: aprovado=true em TODOS os pontos (VETO-2)
// ═══════════════════════════════════════════════════════════════════════════════
describe('0053 §3 — GATE CRÍTICO: coord pendente não passa nas guards (VETO-2)', () => {
  // Ponto 1: is_dor_course_coordinator (0031) — epicentro
  it('is_dor_course_coordinator retorna false para coord pendente (aprovado=false)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    // Insere vínculo PENDENTE (aprovado=false)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', false)`
    )
    await comoUsuario(db, { uid: UID_COORD })
    const row = (await db.query<{ result: boolean }>(
      `select public.is_dor_course_coordinator('${projetoId}') result`
    )).rows[0]!
    expect(row.result).toBe(false)
    await db.close()
  })

  it('is_dor_course_coordinator retorna true para coord aprovado (aprovado=true)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', true)`
    )
    await comoUsuario(db, { uid: UID_COORD })
    const row = (await db.query<{ result: boolean }>(
      `select public.is_dor_course_coordinator('${projetoId}') result`
    )).rows[0]!
    expect(row.result).toBe(true)
    await db.close()
  })

  // Ponto 2: is_course_coordinator (0004)
  it('is_course_coordinator retorna false para coord pendente', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', false)`
    )
    await comoUsuario(db, { uid: UID_COORD })
    const row = (await db.query<{ result: boolean }>(
      `select public.is_course_coordinator('${CURSO_ID}') result`
    )).rows[0]!
    expect(row.result).toBe(false)
    await db.close()
  })

  it('is_course_coordinator retorna true para coord aprovado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', true)`
    )
    await comoUsuario(db, { uid: UID_COORD })
    const row = (await db.query<{ result: boolean }>(
      `select public.is_course_coordinator('${CURSO_ID}') result`
    )).rows[0]!
    expect(row.result).toBe(true)
    await db.close()
  })

  // Ponto 3: equipe_publica (0036) — vitrine não lista cursos de coord pendente
  it('equipe_publica não lista cursos de coord pendente na string_agg', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    // Fecha equipe com coord pendente como membro (host)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', false)`
    )
    await comoServiceRole(db)
    await db.query(
      `insert into public.membro_equipe(projeto_id, pessoa_id, papel_projeto, created_by)
       values ('${projetoId}', '${UID_COORD}', 'host', '${UID_COORD}')`
    )
    await comoAnon(db)
    const rows = (await db.query<{ curso: string | null }>(
      `select curso from public.equipe_publica('${projetoId}')`
    )).rows
    // Coord pendente: curso deve ser null ou não deve aparecer como coordenador aprovado
    const cursosCoord = rows.filter(r => r.curso && r.curso.includes('Direito'))
    expect(cursosCoord).toHaveLength(0)
    await db.close()
  })

  // Ponto 4: trigger notificação (0037) — coord pendente não recebe notif de abertura
  it('_projeto_notificar_abertura não envia notif a coord pendente (aprovado=false)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // Insere vínculo PENDENTE antes de criar o projeto
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', false)`
    )
    // Cria projeto (dispara trigger)
    await seedProjeto(db)

    await comoServiceRole(db)
    const rows = (await db.query<{ destinatario_id: string }>(
      `select destinatario_id::text from public.notificacao
       where destinatario_id = '${UID_COORD}'`
    )).rows
    expect(rows).toHaveLength(0)
    await db.close()
  })

  it('_projeto_notificar_abertura envia notif a coord aprovado (aprovado=true)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // Insere vínculo APROVADO antes de criar o projeto
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', true)`
    )
    // Cria projeto (dispara trigger)
    await seedProjeto(db)

    await comoServiceRole(db)
    const rows = (await db.query<{ destinatario_id: string }>(
      `select destinatario_id::text from public.notificacao
       where destinatario_id = '${UID_COORD}'`
    )).rows
    expect(rows.length).toBeGreaterThan(0)
    await db.close()
  })

  // Ponto 5: indicacoes_coordenador (0052) — coord pendente recebe vazio
  it('indicacoes_coordenador retorna vazio para coord pendente (vazamento PII — VETO-2)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    // Indica o aluno no projeto
    await comoServiceRole(db)
    await db.query(
      `insert into public.indicacao(projeto_id, pessoa_id, papel_pretendido, created_by)
       values ('${projetoId}', '${UID_ALUNO}', 'aluno', '${UID_ALUNO}')`
    )
    // Insere coord PENDENTE
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', false)`
    )
    // Coord pendente chama RPC — deve receber vazio
    await comoUsuario(db, { uid: UID_COORD })
    const rows = (await db.query<{ id: string }>(
      `select id from public.indicacoes_coordenador('${projetoId}')`
    )).rows
    expect(rows).toHaveLength(0)
    await db.close()
  })

  it('indicacoes_coordenador retorna dados para coord aprovado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const projetoId = await seedProjeto(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.indicacao(projeto_id, pessoa_id, papel_pretendido, created_by)
       values ('${projetoId}', '${UID_ALUNO}', 'aluno', '${UID_ALUNO}')`
    )
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', true)`
    )
    await comoUsuario(db, { uid: UID_COORD })
    const rows = (await db.query<{ id: string }>(
      `select id from public.indicacoes_coordenador('${projetoId}')`
    )).rows
    expect(rows.length).toBeGreaterThan(0)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §4 — RLS: coordenador NÃO consegue UPDATE direto de aprovado (anti auto-aprovação)
// ═══════════════════════════════════════════════════════════════════════════════
describe('0053 §4 — RLS: sem UPDATE direto de aprovado pelo próprio coord', () => {
  it('coordenador não consegue UPDATE em aprovado via SQL direto (VETO-3)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado)
       values ('${UID_COORD}', '${CURSO_ID}', false)`
    )
    await comoUsuario(db, { uid: UID_COORD })
    // UPDATE direto deve ser negado pela ausência de policy write para o usuário
    const resultado = await negado(
      db.query(
        `update public.coordenador_curso set aprovado = true
         where user_id = '${UID_COORD}' and curso_id = '${CURSO_ID}'`
      )
    )
    // Nega o UPDATE ou 0 rows afetadas (RLS nega silenciosamente)
    await comoServiceRole(db)
    const row = (await db.query<{ aprovado: boolean }>(
      `select aprovado from public.coordenador_curso where user_id = '${UID_COORD}'`
    )).rows[0]!
    expect(row.aprovado).toBe(false)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §5 — Grants: helpers de escopo têm execute p/ anon + authenticated
// ═══════════════════════════════════════════════════════════════════════════════
describe('0053 §5 — Grants finais após hardening', () => {
  it('authenticated tem execute em onboarding_coordenador', async () => {
    const db = await novoBanco()
    const ok = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('authenticated', 'public.onboarding_coordenador(curso_ubm[],text)', 'execute') ok`
    )).rows[0]!.ok
    expect(ok).toBe(true)
    await db.close()
  })

  it('authenticated tem execute em aprovar_coordenador', async () => {
    const db = await novoBanco()
    const ok = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('authenticated', 'public.aprovar_coordenador(uuid,uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(ok).toBe(true)
    await db.close()
  })

  it('is_dor_course_coordinator: anon + authenticated têm execute (helper público)', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ role: string; ok: boolean }>(
      `select 'anon' as role, has_function_privilege('anon', 'public.is_dor_course_coordinator(uuid)', 'execute') ok
       union all
       select 'authenticated', has_function_privilege('authenticated', 'public.is_dor_course_coordinator(uuid)', 'execute')`
    )).rows
    expect(rows.every(r => r.ok)).toBe(true)
    await db.close()
  })

  it('is_course_coordinator: anon + authenticated têm execute (helper público)', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ role: string; ok: boolean }>(
      `select 'anon' as role, has_function_privilege('anon', 'public.is_course_coordinator(uuid)', 'execute') ok
       union all
       select 'authenticated', has_function_privilege('authenticated', 'public.is_course_coordinator(uuid)', 'execute')`
    )).rows
    expect(rows.every(r => r.ok)).toBe(true)
    await db.close()
  })
})
