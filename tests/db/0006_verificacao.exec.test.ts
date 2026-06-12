// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario } from './_pglite/harness'

// Onda 4 / CA25 / VETO-1 — token: hash-only no banco, uso único, expiração, invalida pendentes, genérico.
const A = '00000000-0000-0000-0000-0000000000aa'
const seed = (db: import('@electric-sql/pglite').PGlite) =>
  db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
const verificado = async (db: import('@electric-sql/pglite').PGlite) =>
  (await db.query<{ v: boolean }>(`select verificado_em is not null v from public.perfil where user_id='${A}'`)).rows[0]?.v
const verificar = async (db: import('@electric-sql/pglite').PGlite, token: string) =>
  (await db.query<{ ok: boolean }>(`select public.verificar_conta($1) ok`, [token])).rows[0]?.ok

describe('0006 verificação por token', () => {
  it('emite token (só hash no banco), verifica uma única vez e marca a conta', async () => {
    const db = await novoBanco()
    await seed(db)
    await comoUsuario(db, { uid: A })
    const token = (await db.query<{ t: string }>(`select public.emitir_token_verificacao() t`)).rows[0]!.t
    expect(token.length).toBeGreaterThanOrEqual(32) // >=128 bits

    // o banco NÃO guarda o token bruto (só o sha256)
    await db.exec('reset role')
    const claro = await db.query<{ n: number }>(
      `select count(*)::int n from public.verificacao_token where token_hash = convert_to($1,'UTF8')`, [token],
    )
    expect(claro.rows[0]?.n).toBe(0)
    const hashed = await db.query<{ n: number }>(
      `select count(*)::int n from public.verificacao_token where token_hash = sha256(convert_to($1,'UTF8'))`, [token],
    )
    expect(hashed.rows[0]?.n).toBe(1)

    expect(await verificado(db)).toBe(false)
    expect(await verificar(db, token)).toBe(true) // 1ª vez → ok
    expect(await verificado(db)).toBe(true)
    expect(await verificar(db, token)).toBe(false) // uso único → recusa
    await db.close()
  })

  it('token errado/expirado recusado; reenvio invalida o anterior', async () => {
    const db = await novoBanco()
    await seed(db)
    await comoUsuario(db, { uid: A })
    expect(await verificar(db, 'token-invalido-qualquer')).toBe(false) // genérico

    const t1 = (await db.query<{ t: string }>(`select public.emitir_token_verificacao() t`)).rows[0]!.t
    const t2 = (await db.query<{ t: string }>(`select public.emitir_token_verificacao() t`)).rows[0]!.t // invalida t1
    expect(await verificar(db, t1)).toBe(false) // antigo invalidado
    // expira t2 manualmente
    await db.exec(`reset role; update public.verificacao_token set expira_em = now() - interval '1 min' where usado_em is null`)
    expect(await verificar(db, t2)).toBe(false) // expirado
    await db.close()
  })
})
