// @vitest-environment node
// T-B5 RED — 0042 onboarding_representante v2: +p_email_corporativo (contato)
// Rastreab.: CA31, CA32 · RN22, RN21 · SR-B13 · ADR-004F (F.3)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const USR = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${USR}', 'user@gmail.com'),
      ('${ADM}', 'adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Corp SA', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

describe('0042 onboarding v2 — login @gmail + email_corporativo contato funciona', () => {
  it('login @gmail + p_email_corporativo válido → vincula + grava contato (CA31)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    // Login com email PESSOAL (@gmail) — diferente do contato corporativo
    await comoUsuario(db, { uid: USR, email: 'user@gmail.com' })
    await db.query(
      `select public.onboarding_representante($1, $2, $3, $4, $5)`,
      [eid, 'User Name', 'TI', 'Analista', 'user@corp.com']
    )

    await comoServiceRole(db)
    const membro = (await db.query<{ email_corporativo: string | null }>(
      `select email_corporativo from public.membro_empresa where user_id = $1`, [USR],
    )).rows[0]!
    expect(membro.email_corporativo, 'email_corporativo de contato gravado (não o jwt.email)').toBe('user@corp.com')

    const papel = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id = $1 and role = 'representante'`, [USR],
    )).rows[0]!.n
    expect(papel, 'papel representante criado').toBe(1)
    await db.close()
  })

  it('p_email_corporativo genérico (@gmail) → negado (SR-B13)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoUsuario(db, { uid: USR, email: 'user@gmail.com' })
    const err = await negado(
      db.query(
        `select public.onboarding_representante($1, $2, $3, $4, $5)`,
        [eid, 'User', 'TI', 'Dev', 'user@gmail.com']
      )
    )
    expect(err, 'e-mail genérico como contato deve ser negado').toBe(true)
    await db.close()
  })

  it('idempotência on conflict preservada — re-chamada não duplica', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoUsuario(db, { uid: USR, email: 'user@gmail.com' })
    await db.query(
      `select public.onboarding_representante($1, $2, $3, $4, $5)`,
      [eid, 'User', 'TI', 'Dev', 'user@corp.com']
    )
    await db.query(
      `select public.onboarding_representante($1, $2, $3, $4, $5)`,
      [eid, 'User Updated', 'Eng', 'Senior', 'user@corp.com']
    )

    await comoServiceRole(db)
    const papeis = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id = $1 and role = 'representante'`, [USR],
    )).rows[0]!.n
    expect(papeis, 're-chamada não duplica papel').toBe(1)

    const membro = (await db.query<{ departamento: string; cargo: string }>(
      `select departamento, cargo from public.membro_empresa where user_id = $1`, [USR],
    )).rows[0]!
    expect(membro.departamento, 'departamento atualizado').toBe('Eng')
    expect(membro.cargo, 'cargo atualizado').toBe('Senior')
    await db.close()
  })
})
