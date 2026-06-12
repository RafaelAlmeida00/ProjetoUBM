// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

// Onda 5 — CA13/CA21 (notif own), CA22 (outbox idempotente), CA24 (gate de verificação), CA19/CA20 (erasure alcança o log).
const A = '00000000-0000-0000-0000-0000000000aa'
const B = '00000000-0000-0000-0000-0000000000bb'
const seed = (db: import('@electric-sql/pglite').PGlite) =>
  db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com'),('${B}','b@empresa.com')`)

describe('0010 notificação + outbox + gate + erasure', () => {
  it('cada um vê só as próprias notificações (CA13/CA21)', async () => {
    const db = await novoBanco(); await seed(db)
    await comoServiceRole(db)
    await db.query(`select public.criar_notificacao('${A}','status_mudou','{}'::jsonb)`)
    await db.query(`select public.criar_notificacao('${B}','status_mudou','{}'::jsonb)`)
    await comoUsuario(db, { uid: A })
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.notificacao`)).rows[0]?.n).toBe(1)
    await db.close()
  })

  it('e-mail no outbox é idempotente por chave (CA22)', async () => {
    const db = await novoBanco(); await seed(db)
    await comoServiceRole(db)
    const call = `select public.criar_notificacao('${A}','verificacao_conta','{}'::jsonb,'verificacao_conta:${A}:t1','a@empresa.com','verif')`
    await db.query(call)
    await db.query(call) // reentrega/retry: NÃO duplica
    await db.exec('reset role')
    expect((await db.query<{ n: number }>(`select count(*)::int n from fila.email_outbox where chave_idempotencia='verificacao_conta:${A}:t1'`)).rows[0]?.n).toBe(1)
    await db.close()
  })

  it('gate: conta não verificada NÃO escreve preferência (não-perfil), mas edita o perfil (CA24)', async () => {
    const db = await novoBanco(); await seed(db)
    await comoUsuario(db, { uid: A }) // não verificado
    await db.query(`update public.perfil set nome_publico='ok' where user_id='${A}'`) // perfil: permitido
    expect(await negado(db.query(`insert into public.notificacao_preferencia(user_id,tipo,email) values ('${A}','status_mudou',false)`))).toBe(true)
    await db.exec(`reset role; update public.perfil set verificado_em=now() where user_id='${A}'`)
    await comoUsuario(db, { uid: A }) // verificado
    await db.query(`insert into public.notificacao_preferencia(user_id,tipo,email) values ('${A}','status_mudou',false)`) // agora ok
    await db.close()
  })

  it('erasure anonimiza PII inclusive no log de auditoria (CA19/CA20)', async () => {
    const db = await novoBanco(); await seed(db)
    await comoUsuario(db, { uid: A })
    await db.query(`update public.perfil set nome_publico='Segredo' where user_id='${A}'`) // gera log com PII
    await db.exec('reset role')
    expect((await db.query<{ n: number }>(`select count(*)::int n from audit.record_version where record->>'nome_publico'='Segredo'`)).rows[0]?.n).toBeGreaterThan(0)

    // não-admin não faz erasure
    await comoUsuario(db, { uid: B })
    expect(await negado(db.query(`select public.erasure_titular('${A}')`))).toBe(true)

    await db.exec(`reset role; insert into public.admin_app(user_id) values ('${B}')`)
    await comoUsuario(db, { uid: B })
    await db.query(`select public.erasure_titular('${A}')`)
    await db.exec('reset role')
    expect((await db.query<{ n: number }>(`select count(*)::int n from audit.record_version where record->>'nome_publico'='Segredo'`)).rows[0]?.n).toBe(0) // PII some do log
    expect((await db.query<{ v: string }>(`select nome_publico v from public.perfil where user_id='${A}'`)).rows[0]?.v).toBe('[removido]')
    await db.close()
  })
})
