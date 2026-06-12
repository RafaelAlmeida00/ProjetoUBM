// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, comoAnon, negado } from './_pglite/harness'

// Onda 1 / T-O1.9 — hardening: revoke execute from public em todas as RPCs SECURITY DEFINER.
// RS-H1 [DURO]: nenhuma função SECURITY DEFINER em public concede EXECUTE a PUBLIC.
// RS-H2 [DURO]: criar_notificacao e quer_email só service_role.
// RS-H4: gate interno mantido (grants legítimos continuam funcionando).
const A = '00000000-0000-0000-0000-0000000000aa'
const ADM = '00000000-0000-0000-0000-0000000000cc'

describe('0023 hardening SECURITY DEFINER grants', () => {
  it('RS-H1: nenhuma função SECURITY DEFINER em public tem execute para PUBLIC (pg_catalog view)', async () => {
    const db = await novoBanco()
    // Consulta pg_proc + pg_namespace para verificar que nenhuma SECURITY DEFINER tem ACL pública
    // Usa has_function_privilege('public', ...) ou verifica aclexplode
    // Estratégia: lista todas as funções SECURITY DEFINER em public e verifica via aclexplode
    // que 'public' (role especial) NÃO aparece como grantee com privilege 'EXECUTE'.
    const falhas = (await db.query<{ proname: string }>(
      `select p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.prosecdef = true   -- SECURITY DEFINER
         and (
           -- Verifica se 'public' (oid=0) aparece na ACL com execute
           select count(*) > 0
           from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where a.grantee = 0  -- oid 0 = PUBLIC
             and a.privilege_type = 'EXECUTE'
         )`
    )).rows
    const nomes = falhas.map(r => r.proname)
    expect(
      nomes,
      `funções SECURITY DEFINER com EXECUTE para PUBLIC (devem ser zero): ${nomes.join(', ')}`
    ).toHaveLength(0)
    await db.close()
  })

  it('RS-H2: criar_notificacao NÃO é executável por authenticated', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
    await comoUsuario(db, { uid: A })
    expect(await negado(db.query(`select public.criar_notificacao('${A}','status_mudou','{}')`))).toBe(true)
    await db.close()
  })

  it('RS-H2: criar_notificacao NÃO é executável por anon', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
    await comoAnon(db)
    expect(await negado(db.query(`select public.criar_notificacao('${A}','status_mudou','{}')`))).toBe(true)
    await db.close()
  })

  it('RS-H2: criar_notificacao É executável por service_role', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
    await comoServiceRole(db)
    // não deve lançar
    await db.query(`select public.criar_notificacao('${A}','status_mudou','{}')`)
    await db.close()
  })

  it('RS-H4: is_admin() continua funcional para authenticated (grant mínimo mantido)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com'),('${ADM}','adm@empresa.com')`)
    await db.exec(`insert into public.admin_app(user_id) values ('${ADM}')`)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    const r = (await db.query<{ v: boolean }>(`select public.is_admin() v`)).rows[0]!.v
    expect(r).toBe(true)
    await db.close()
  })

  it('RS-H4: esta_verificado() continua funcional para authenticated (grant mínimo mantido)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
    await db.exec(`update public.perfil set verificado_em=now() where user_id='${A}'`)
    await comoUsuario(db, { uid: A })
    const r = (await db.query<{ v: boolean }>(`select public.esta_verificado() v`)).rows[0]!.v
    expect(r).toBe(true)
    await db.close()
  })

  it('RS-H4: buscar_empresa() continua funcional para anon (grant mínimo mantido)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
    await db.exec(`insert into public.empresa(nome_canonico, created_by) values ('Nissan','${A}')`)
    await comoAnon(db)
    const rows = (await db.query<{ n: number }>(`select count(*)::int n from public.buscar_empresa('Nissan')`)).rows[0]!.n
    expect(rows).toBeGreaterThan(0)
    await db.close()
  })

  it('RS-H4: verificar_conta() continua funcional para anon (grant mínimo mantido)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
    await comoAnon(db)
    // token inválido deve retornar false (não deve lançar "permission denied")
    const r = (await db.query<{ ok: boolean }>(`select public.verificar_conta('token-invalido') ok`)).rows[0]!.ok
    expect(r).toBe(false) // acesso ok, resultado esperado (token inválido)
    await db.close()
  })

  it('RS-H4: submeter_dor() exige authenticated (não anon)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
    await comoAnon(db)
    // anon não pode chamar submeter_dor (grant só a authenticated)
    expect(await negado(db.query(`select public.submeter_dor('00000000-0000-0000-0000-000000000000'::uuid)`))).toBe(true)
    await db.close()
  })

  it('RS-H4: moderar_dor() exige authenticated (não anon)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    expect(await negado(db.query(`select public.moderar_dor('00000000-0000-0000-0000-000000000000'::uuid,'aprovar',null)`))).toBe(true)
    await db.close()
  })
})
