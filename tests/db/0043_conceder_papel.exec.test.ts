// @vitest-environment node
// T-X3a RED — 0043 conceder_papel(p_user_id, p_role): DEFINER admin-only, coluna role (não papel)
// Rastreab.: diagnóstico Maestro B3 / report arquiteto §8 · padrão DEFINER admin-only (0008/0027)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const ADM = '00000000-0000-0000-0000-0000000000cc'
const USR = '00000000-0000-0000-0000-0000000000bb'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${ADM}', 'adm@empresa.com'),
      ('${USR}', 'user@gmail.com');
    insert into public.admin_app(user_id) values ('${ADM}');
  `)
}

describe('0043 conceder_papel — admin concede papel (coluna role) (T-X3a)', () => {
  it('admin concede papel → linha em papel_usuario com coluna role correta', async () => {
    const db = await novoBanco()
    await seedBase(db)

    // 0055/0057: conceder_papel agora é SÓ-aluno (coordenador→conceder_coordenador c/ curso;
    // representante→conceder_representante c/ empresa). Testa o papel direto remanescente: aluno.
    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    await db.query(`select public.conceder_papel($1, $2)`, [USR, 'aluno'])

    await comoServiceRole(db)
    const rows = (await db.query<{ role: string }>(
      `select role from public.papel_usuario where user_id = $1`, [USR],
    )).rows
    expect(rows.length, 'deve existir 1 linha em papel_usuario').toBe(1)
    expect(rows[0]!.role, 'coluna role deve conter o papel concedido').toBe('aluno')
    await db.close()
  })

  it('on conflict do nothing — conceder papel idempotente (sem duplicata)', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    await db.query(`select public.conceder_papel($1, $2)`, [USR, 'aluno'])
    await db.query(`select public.conceder_papel($1, $2)`, [USR, 'aluno'])

    await comoServiceRole(db)
    const rows = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id = $1 and role = 'aluno'`,
      [USR],
    )).rows
    expect(rows[0]!.n, 'on conflict: apenas 1 linha, sem duplicata').toBe(1)
    await db.close()
  })

  it('não-admin → negado (guard is_admin())', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: USR, email: 'user@gmail.com' })
    const err = await negado(
      db.query(`select public.conceder_papel($1, $2)`, [USR, 'representante']),
    )
    expect(err, 'não-admin não deve conceder papel').toBe(true)
    await db.close()
  })

  it('anon → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoAnon(db)
    const err = await negado(
      db.query(`select public.conceder_papel($1, $2)`, [USR, 'representante']),
    )
    expect(err, 'anon não deve conceder papel').toBe(true)
    await db.close()
  })

  it('[0055/0057] conceder_papel BLOQUEIA coordenador e representante (força RPCs dedicadas)', async () => {
    const db = await novoBanco()
    await seedBase(db)

    // coordenador exige curso (conceder_coordenador); representante exige empresa (conceder_representante)
    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    const errCoord = await negado(
      db.query(`select public.conceder_papel($1, $2)`, [USR, 'coordenador']),
    )
    expect(errCoord, 'conceder_papel(coordenador) deve ser bloqueado').toBe(true)
    const errRep = await negado(
      db.query(`select public.conceder_papel($1, $2)`, [USR, 'representante']),
    )
    expect(errRep, 'conceder_papel(representante) deve ser bloqueado').toBe(true)

    // Nenhum papel inserido pelos caminhos bloqueados
    await comoServiceRole(db)
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id = $1`, [USR],
    )).rows[0]!.n
    expect(n, 'nenhum papel inserido por conceder_papel bloqueado').toBe(0)
    await db.close()
  })

  it('[DURO] papel fora do enum app_role é rejeitado (cast fail-closed, sem inserção)', async () => {
    const db = await novoBanco()
    await seedBase(db)

    // Admin tenta conceder um papel inexistente — o cast p_role::app_role deve lançar
    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    const err = await negado(
      db.query(`select public.conceder_papel($1, $2)`, [USR, 'papel_inexistente_xyz']),
    )
    expect(err, '[DURO] papel fora do enum deve ser rejeitado pelo cast').toBe(true)

    // Confirma fail-closed: nenhuma linha foi inserida mesmo sendo chamada por admin
    await comoServiceRole(db)
    const rows = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id = $1`, [USR],
    )).rows
    expect(rows[0]!.n, 'nenhuma linha em papel_usuario após papel inválido').toBe(0)
    await db.close()
  })
})
