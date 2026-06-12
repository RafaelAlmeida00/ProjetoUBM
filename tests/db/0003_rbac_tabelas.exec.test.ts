// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco } from './_pglite/harness'

// T1b — tabelas de identidade/RBAC com RLS enable+force e chaves corretas (RN1–RN5).
const TABELAS = ['perfil', 'papel_usuario', 'admin_app', 'curso', 'coordenador_curso', 'membro_empresa']

describe('0003 tabelas RBAC', () => {
  it('todas as tabelas existem com RLS enable+force', async () => {
    const db = await novoBanco()
    for (const t of TABELAS) {
      const r = await db.query<{ en: boolean; fo: boolean }>(
        `select relrowsecurity en, relforcerowsecurity fo from pg_class where oid = ('public.' || $1)::regclass`,
        [t],
      )
      expect(r.rows[0]?.en, `${t}: enable RLS`).toBe(true)
      expect(r.rows[0]?.fo, `${t}: force RLS`).toBe(true)
    }
    await db.close()
  })

  it('papel_usuario tem PK composta (user_id, role) e curso.slug é único por ativo', async () => {
    const db = await novoBanco()
    const pk = await db.query<{ cols: string }>(
      `select string_agg(a.attname, ',' order by array_position(c.conkey, a.attnum)) cols
       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
       where c.conrelid = 'public.papel_usuario'::regclass and c.contype = 'p'`,
    )
    expect(pk.rows[0]?.cols).toBe('user_id,role')
    // índice único parcial em curso(slug) where deleted_at is null
    const idx = await db.query<{ n: number }>(
      `select count(*)::int n from pg_indexes where tablename='curso' and indexdef ilike '%unique%slug%deleted_at is null%'`,
    )
    expect(idx.rows[0]?.n).toBeGreaterThan(0)
    await db.close()
  })
})
