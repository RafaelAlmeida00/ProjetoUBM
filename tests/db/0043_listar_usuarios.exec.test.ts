// @vitest-environment node
// T-X2 RED — 0043 listar_usuarios_admin(): join auth.users × papel_usuario × admin_app
// Shape: { id uuid, email text, papeis text[], is_admin boolean }
// Rastreab.: diagnóstico Maestro B2 / report arquiteto §7 · admin-only (LGPD e-mail)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, negado } from './_pglite/harness'

const ADM = '00000000-0000-0000-0000-0000000000cc'
const USR = '00000000-0000-0000-0000-0000000000bb'
const USR2 = '00000000-0000-0000-0000-0000000000dd'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${ADM}',  'adm@empresa.com'),
      ('${USR}',  'user@gmail.com'),
      ('${USR2}', 'outro@corp.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    -- USR tem papel representante
    insert into public.papel_usuario(user_id, role) values ('${USR}', 'representante');
    -- USR2 sem papel
  `)
}

describe('0043 listar_usuarios_admin — shape UsuarioAdmin (T-X2)', () => {
  it('admin → retorna lista com id, email, papeis[], is_admin para todos os usuários', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    const rows = (await db.query<{
      id: string;
      email: string;
      papeis: string[];
      is_admin: boolean;
    }>(`select * from public.listar_usuarios_admin()`)).rows

    expect(rows.length, 'deve retornar 3 usuários').toBe(3)

    const admin = rows.find(r => r.id === ADM)
    expect(admin, 'ADM deve estar na lista').toBeTruthy()
    expect(admin!.email).toBe('adm@empresa.com')
    expect(admin!.is_admin, 'ADM deve ter is_admin = true').toBe(true)
    await db.close()
  })

  it('usuário com papel → papeis[] contém o papel', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    const rows = (await db.query<{ id: string; papeis: string[] }>(
      `select * from public.listar_usuarios_admin()`,
    )).rows

    const usr = rows.find(r => r.id === USR)
    expect(usr, 'USR deve estar na lista').toBeTruthy()
    expect(usr!.papeis, 'papeis deve conter representante').toContain('representante')
    await db.close()
  })

  it('usuário sem papel → papeis[] é array vazio', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    const rows = (await db.query<{ id: string; papeis: string[] }>(
      `select * from public.listar_usuarios_admin()`,
    )).rows

    const usr2 = rows.find(r => r.id === USR2)
    expect(usr2, 'USR2 deve estar na lista').toBeTruthy()
    expect(usr2!.papeis.length, 'papeis deve ser vazio para usuário sem papel').toBe(0)
    await db.close()
  })

  it('não-admin → negado (admin-only LGPD)', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: USR, email: 'user@gmail.com' })
    const err = await negado(db.query(`select * from public.listar_usuarios_admin()`))
    expect(err, 'não-admin não deve acessar listar_usuarios_admin').toBe(true)
    await db.close()
  })

  it('anon → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoAnon(db)
    const err = await negado(db.query(`select * from public.listar_usuarios_admin()`))
    expect(err, 'anon não deve acessar listar_usuarios_admin').toBe(true)
    await db.close()
  })

  it('e-mail presente APENAS no caminho admin (proteção LGPD)', async () => {
    const db = await novoBanco()
    await seedBase(db)

    // Confirma que a função não está acessível a não-admin (e-mail protegido)
    await comoUsuario(db, { uid: USR, email: 'user@gmail.com' })
    const err = await negado(db.query(`select email from public.listar_usuarios_admin()`))
    expect(err, 'e-mail não deve ser acessível a não-admin').toBe(true)
    await db.close()
  })
})
