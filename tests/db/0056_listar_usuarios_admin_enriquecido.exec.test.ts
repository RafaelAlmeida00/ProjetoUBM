// @vitest-environment node
// T-B10 PGlite — migração 0056: listar_usuarios_admin enriquecida (nome + cursos_coordenados)
// Cobre: admin vê nome + cursos_coordenados; não-admin → raise; anon → negado;
//        coordenador aprovado aparece com seu(s) curso(s); não-coordenador → []; pending-only → [].
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, comoAnon, negado } from './_pglite/harness'

// ── UUIDs fixos por contexto ─────────────────────────────────────────────────
const UID_ADM    = '56000000-0000-0000-0000-000000000001'
const UID_USR    = '56000000-0000-0000-0000-000000000002'  // usuário sem curso
const UID_COORD  = '56000000-0000-0000-0000-000000000003'  // coordenador aprovado
const UID_PEND   = '56000000-0000-0000-0000-000000000004'  // coordenador PENDENTE (não-aprovado)
const UID_NOADM  = '56000000-0000-0000-0000-000000000005'  // authenticated não-admin
const CURSO_ID   = '56000000-0000-0000-0000-000000000010'
const CURSO2_ID  = '56000000-0000-0000-0000-000000000011'

// ── Seed base ────────────────────────────────────────────────────────────────
async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${UID_ADM}',   'admin56@ubm.br'),
      ('${UID_USR}',   'user56@ubm.br'),
      ('${UID_COORD}', 'coord56@ubm.br'),
      ('${UID_PEND}',  'pend56@ubm.br'),
      ('${UID_NOADM}', 'noadm56@ubm.br');
    insert into public.admin_app(user_id) values ('${UID_ADM}');
    -- perfis com nome_publico (trigger on_auth_user_created já inseriu a linha; upsert o nome)
    insert into public.perfil(user_id, nome_publico) values
      ('${UID_ADM}',   'Admin Principal'),
      ('${UID_USR}',   'Usuário Sem Curso'),
      ('${UID_COORD}', 'Coordenador Aprovado'),
      ('${UID_PEND}',  'Pendente Aguardando')
    on conflict (user_id) do update set nome_publico = excluded.nome_publico;
    -- UID_NOADM: perfil inserido pelo trigger mas sem nome_publico (null → coalesce → '')
    insert into public.curso(id, slug, nome) values
      ('${CURSO_ID}',  'direito',  'Direito'),
      ('${CURSO2_ID}', 'farmacia', 'Farmácia');
    -- papéis
    insert into public.papel_usuario(user_id, role) values
      ('${UID_COORD}', 'coordenador'),
      ('${UID_PEND}',  'coordenador');
    -- vínculo APROVADO (coord)
    insert into public.coordenador_curso(user_id, curso_id, aprovado)
      values ('${UID_COORD}', '${CURSO_ID}', true);
    -- vínculo PENDENTE (pend) — aprovado=false → NÃO deve aparecer em cursos_coordenados
    insert into public.coordenador_curso(user_id, curso_id, aprovado)
      values ('${UID_PEND}', '${CURSO_ID}', false);
  `)
}

// ── Helpers de role ──────────────────────────────────────────────────────────
const asAdmin = (db: import('@electric-sql/pglite').PGlite) =>
  comoUsuario(db, { uid: UID_ADM, appMeta: { is_admin: true } })

const asNoAdm = (db: import('@electric-sql/pglite').PGlite) =>
  comoUsuario(db, { uid: UID_NOADM, appMeta: { is_admin: false } })

// ── Helper: chama listar_usuarios_admin e retorna rows ───────────────────────
async function listar(db: import('@electric-sql/pglite').PGlite) {
  return (await db.query<{
    id: string
    email: string
    nome: string
    papeis: string[]
    is_admin: boolean
    cursos_coordenados: { curso_id: string; curso_label: string }[]
  }>(`select * from public.listar_usuarios_admin()`)).rows
}

// ═══════════════════════════════════════════════════════════════════════════════
// §H — HARDENING: anon e não-admin bloqueados
// ═══════════════════════════════════════════════════════════════════════════════
describe('0056 §H — controle de acesso', () => {
  it('anon → listar_usuarios_admin lança (negado)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoAnon(db)
    expect(await negado(db.query(`select * from public.listar_usuarios_admin()`))).toBe(true)
    await db.close()
  })

  it('authenticated não-admin → listar_usuarios_admin lança (gate is_admin)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asNoAdm(db)
    expect(await negado(db.query(`select * from public.listar_usuarios_admin()`))).toBe(true)
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §1 — Shape: campos nome e cursos_coordenados presentes
// ═══════════════════════════════════════════════════════════════════════════════
describe('0056 §1 — shape da resposta (nome + cursos_coordenados)', () => {
  it('admin recebe lista com campo nome em todos os registros', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const rows = await listar(db)
    expect(rows.length).toBeGreaterThan(0)
    // todos têm campo nome (string)
    for (const r of rows) {
      expect(typeof r.nome).toBe('string')
    }
    await db.close()
  })

  it('admin recebe campo cursos_coordenados em todos os registros', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const rows = await listar(db)
    for (const r of rows) {
      expect(Array.isArray(r.cursos_coordenados)).toBe(true)
    }
    await db.close()
  })

  it('campos legados (id, email, papeis, is_admin) continuam presentes', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const rows = await listar(db)
    for (const r of rows) {
      expect(r.id).toBeDefined()
      expect(r.email).toBeDefined()
      expect(Array.isArray(r.papeis)).toBe(true)
      expect(typeof r.is_admin).toBe('boolean')
    }
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §2 — nome: coalesce(perfil.nome_publico, '')
// ═══════════════════════════════════════════════════════════════════════════════
describe('0056 §2 — campo nome (coalesce perfil)', () => {
  it('usuário com perfil → nome = nome_publico', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const rows = await listar(db)
    const coord = rows.find(r => r.id === UID_COORD)
    expect(coord?.nome).toBe('Coordenador Aprovado')
    await db.close()
  })

  it('usuário sem perfil → nome = "" (coalesce de null)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const rows = await listar(db)
    const noadm = rows.find(r => r.id === UID_NOADM)
    expect(noadm?.nome).toBe('')
    await db.close()
  })

  it('admin tem nome_publico correto', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const rows = await listar(db)
    const adm = rows.find(r => r.id === UID_ADM)
    expect(adm?.nome).toBe('Admin Principal')
    await db.close()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §3 — cursos_coordenados: apenas aprovado=true
// ═══════════════════════════════════════════════════════════════════════════════
describe('0056 §3 — cursos_coordenados (só vínculos aprovados)', () => {
  it('coordenador aprovado → cursos_coordenados tem o curso com curso_id e curso_label', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const rows = await listar(db)
    const coord = rows.find(r => r.id === UID_COORD)
    expect(coord?.cursos_coordenados).toHaveLength(1)
    expect(coord?.cursos_coordenados[0]?.curso_id).toBe(CURSO_ID)
    expect(coord?.cursos_coordenados[0]?.curso_label).toBe('Direito')
    await db.close()
  })

  it('coordenador com vínculo PENDENTE (aprovado=false) → cursos_coordenados = []', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const rows = await listar(db)
    const pend = rows.find(r => r.id === UID_PEND)
    expect(pend?.cursos_coordenados).toHaveLength(0)
    await db.close()
  })

  it('usuário sem vínculo de coordenação → cursos_coordenados = []', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await asAdmin(db)
    const rows = await listar(db)
    const usr = rows.find(r => r.id === UID_USR)
    expect(usr?.cursos_coordenados).toHaveLength(0)
    await db.close()
  })

  it('coordenador com dois cursos aprovados → cursos_coordenados tem dois objetos', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // seed segundo vínculo aprovado
    await comoServiceRole(db)
    await db.query(
      `insert into public.coordenador_curso(user_id, curso_id, aprovado) values ($1, $2, true)`,
      [UID_COORD, CURSO2_ID]
    )
    await asAdmin(db)
    const rows = await listar(db)
    const coord = rows.find(r => r.id === UID_COORD)
    expect(coord?.cursos_coordenados).toHaveLength(2)
    const labels = coord?.cursos_coordenados.map(c => c.curso_label).sort()
    expect(labels).toEqual(['Direito', 'Farmácia'])
    await db.close()
  })
})
