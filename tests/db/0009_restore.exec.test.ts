// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, negado } from './_pglite/harness'

// Onda 5 / CA17 — soft-delete some das listagens; só admin restaura; restauração auditada.
const A = '00000000-0000-0000-0000-0000000000aa'

describe('0009 soft-delete + restore', () => {
  it('curso soft-deletado some do catálogo público; só admin restaura; auditado', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
    const curso = (
      await db.query<{ id: string }>(`insert into public.curso(slug,nome) values ('musica','Música') returning id`)
    ).rows[0]!.id

    // soft-delete (como postgres p/ simplificar o setup)
    await db.exec(`update public.curso set deleted_at = now() where id = '${curso}'`)
    await comoAnon(db)
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.curso where id='${curso}'`)).rows[0]?.n).toBe(0)

    // não-admin não restaura
    await comoUsuario(db, { uid: A })
    expect(await negado(db.query(`select public.restore_record('curso','${curso}')`))).toBe(true)
    expect(await negado(db.query(`select public.restore_record('public.papel_usuario','${curso}')`))).toBe(true) // fora da allowlist

    // admin restaura → curso volta + auditado como RESTORE
    await db.exec(`reset role; insert into public.admin_app(user_id) values ('${A}')`)
    await comoUsuario(db, { uid: A })
    await db.query(`select public.restore_record('curso','${curso}')`)
    await comoAnon(db)
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.curso where id='${curso}'`)).rows[0]?.n).toBe(1)

    await db.exec('reset role')
    const aud = await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version where tabela='public.curso' and op='RESTORE' and record_id='${curso}'`,
    )
    expect(aud.rows[0]?.n).toBeGreaterThan(0)
    await db.close()
  })
})
