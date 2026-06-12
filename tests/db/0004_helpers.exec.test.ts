// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario } from './_pglite/harness'

const A = '00000000-0000-0000-0000-0000000000aa'
const B = '00000000-0000-0000-0000-0000000000bb'
const seed = (db: import('@electric-sql/pglite').PGlite) =>
  db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com'),('${B}','b@empresa.com')`)
const bool = async (db: import('@electric-sql/pglite').PGlite, expr: string) =>
  (await db.query<{ v: boolean }>(`select ${expr} as v`)).rows[0]?.v

describe('0004 helpers + hook', () => {
  it('is_admin via tabela; user_metadata forjado NÃO concede (anti-EoP RS20); app_metadata concede', async () => {
    const db = await novoBanco()
    await seed(db)
    await db.exec(`insert into public.admin_app(user_id) values ('${A}')`)
    await comoUsuario(db, { uid: A })
    expect(await bool(db, 'public.is_admin()')).toBe(true)
    await comoUsuario(db, { uid: B, userMeta: { is_admin: true } }) // forjado pelo usuário
    expect(await bool(db, 'public.is_admin()')).toBe(false)
    await comoUsuario(db, { uid: B, appMeta: { is_admin: true } }) // claim confiável do hook
    expect(await bool(db, 'public.is_admin()')).toBe(true)
    await db.close()
  })

  it('has_role / is_course_coordinator / is_company_rep / esta_verificado lêem TABELAS', async () => {
    const db = await novoBanco()
    await seed(db)
    await db.exec(`insert into public.papel_usuario(user_id,role) values ('${A}','coordenador')`)
    const curso = (
      await db.query<{ id: string }>(
        `insert into public.curso(slug,nome) values ('engenharia_de_software','Eng. de Software') returning id`,
      )
    ).rows[0]!.id
    await db.exec(`insert into public.coordenador_curso(user_id,curso_id) values ('${A}','${curso}')`)
    // empresa real (a 003 adicionou FK membro_empresa->empresa)
    const emp = (
      await db.query<{ id: string }>(`insert into public.empresa(nome_canonico,created_by) values ('Empresa Teste','${A}') returning id`)
    ).rows[0]!.id
    await db.exec(`insert into public.membro_empresa(user_id,empresa_id) values ('${A}','${emp}')`)

    await comoUsuario(db, { uid: A })
    expect(await bool(db, `public.has_role('coordenador')`)).toBe(true)
    expect(await bool(db, `public.has_role('aluno')`)).toBe(false)
    expect(await bool(db, `public.is_course_coordinator('${curso}')`)).toBe(true)
    expect(await bool(db, `public.is_company_rep('${emp}')`)).toBe(true)
    expect(await bool(db, `public.esta_verificado()`)).toBe(false)

    await db.exec(`reset role; update public.perfil set verificado_em=now() where user_id='${A}'`)
    await comoUsuario(db, { uid: A })
    expect(await bool(db, `public.esta_verificado()`)).toBe(true)
    await db.close()
  })

  it('hook injeta is_admin/roles/verificado nos claims', async () => {
    const db = await novoBanco()
    await seed(db)
    await db.exec(`insert into public.admin_app(user_id) values ('${A}')`)
    await db.exec(`insert into public.papel_usuario(user_id,role) values ('${A}','aluno')`)
    const r = await db.query<{ claims: { is_admin: boolean; roles: string[]; verificado: boolean } }>(
      `select public.custom_access_token_hook(jsonb_build_object('user_id','${A}','claims','{}'::jsonb)) -> 'claims' as claims`,
    )
    expect(r.rows[0]?.claims.is_admin).toBe(true)
    expect(r.rows[0]?.claims.roles).toContain('aluno')
    expect(r.rows[0]?.claims.verificado).toBe(false)
    await db.close()
  })
})
