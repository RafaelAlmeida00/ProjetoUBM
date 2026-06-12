// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

// G4 fixes de segurança — migração 0028
// C1  — storage_dor_select_publica: guarda de precedência OR/AND corrigida (NO-OP no PGlite; verifica apply)
// I2  — storage_dor_select_autor: d.deleted_at is null (NO-OP no PGlite; verifica apply)
// I4  — submeter_dor_landing nega e-mail não-corporativo server-side (RN23/CA23)
// RS-H1 HARDENING anon — has_function_privilege('anon', ...) = false para RPCs admin/privadas

const REP = '00000000-0000-0000-0000-0000000000bb'  // representante (email corporativo)
const ADM = '00000000-0000-0000-0000-0000000000cc'  // admin
const GEN = '00000000-0000-0000-0000-0000000000ee'  // usuário com e-mail genérico (@gmail.com)

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}', 'rep@empresa.com'),
      ('${ADM}', 'adm@empresa.com'),
      ('${GEN}', 'joao@gmail.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by)
      values ('Nissan Corp', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

// ─── Storage: NO-OP no PGlite (guard if exists storage schema) ──────────────
describe('0028 Storage policies (NO-OP no PGlite)', () => {
  it('migração 0028 aplica sem erro no PGlite (guard storage schema)', async () => {
    // novoBanco() carrega todas as migrações; se chegou sem exceção, a 0028 aplicou com guard
    const db = await novoBanco()
    const schemas = (await db.query<{ schema_name: string }>(
      `select schema_name from information_schema.schemata where schema_name = 'storage'`
    )).rows
    expect(schemas.length).toBe(0)  // storage não existe no PGlite — guard funcionou
    await db.close()
  })

  it('tabelas public.dor e public.anexo_dor intactas após 0028 (sem regressão)', async () => {
    const db = await novoBanco()
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from information_schema.tables
        where table_schema = 'public' and table_name in ('dor', 'anexo_dor')`
    )).rows[0]!.n
    expect(n).toBe(2)
    await db.close()
  })
})

// ─── I4: submeter_dor_landing nega e-mail não-corporativo server-side ────────
describe('0028 I4 — submeter_dor_landing exige e-mail corporativo (RN23/CA23)', () => {
  it('I4: rejeita e-mail genérico @gmail.com com exceção corporativo', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    // Usuário com e-mail genérico tenta submeter dor via landing
    await comoUsuario(db, { uid: GEN, email: 'joao@gmail.com' })
    const erro = await negado(
      db.query(
        `select public.submeter_dor_landing($1,$2,$3,$4,$5,$6,$7,$8)`,
        [eid, 'minha dor real', 'João', 'TI', 'Dev', true, 'v1', new Date().toISOString()]
      )
    )
    expect(erro, 'e-mail genérico deve ser negado').toBe(true)
    await db.close()
  })

  it('I4: aceita e-mail corporativo e retorna out_dor_id', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    // Usuário com e-mail corporativo consegue submeter
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const rows = (await db.query<{ out_dor_id: string }>(
      `select * from public.submeter_dor_landing($1,$2,$3,$4,$5,$6,$7,$8)`,
      [eid, 'minha dor real', 'Rep', 'Engenharia', 'Gerente', true, 'v1', new Date().toISOString()]
    )).rows
    expect(rows.length).toBe(1)
    expect(rows[0]!.out_dor_id).toBeTruthy()
    await db.close()
  })

  it('I4: e-mail @hotmail.com (provedor genérico) também é negado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    // Insere usuário hotmail
    await db.exec(`insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000ff', 'maria@hotmail.com')`)
    await comoUsuario(db, { uid: '00000000-0000-0000-0000-0000000000ff', email: 'maria@hotmail.com' })
    const erro = await negado(
      db.query(
        `select public.submeter_dor_landing($1,$2,$3,$4,$5,$6,$7,$8)`,
        [eid, 'minha dor', 'Maria', 'RH', 'Analista', true, 'v1', new Date().toISOString()]
      )
    )
    expect(erro, '@hotmail.com deve ser negado').toBe(true)
    await db.close()
  })

  it('I4: anon continua negado (guarda de sessão permanece)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoAnon(db)
    const erro = await negado(
      db.query(
        `select public.submeter_dor_landing($1,$2,$3,$4,$5,$6,$7,$8)`,
        [eid, 'minha dor', 'X', 'TI', 'Dev', true, 'v1', new Date().toISOString()]
      )
    )
    expect(erro, 'anon deve ser negado').toBe(true)
    await db.close()
  })
})

// ─── I3: cursos sugeridos persistidos via landing (autor NÃO verificado) ─────
describe('0028 I3 — submeter_dor_landing persiste cursos (bypassa policy de verificação)', () => {
  it('I3: cursos passados são gravados em dor_curso mesmo com autor não verificado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    // REP tem e-mail corporativo mas NÃO verificou a conta (sem perfil.verificado_em).
    // A policy dor_curso_insert_autor exige esta_verificado() → o antigo loop client-side falhava.
    // A RPC (SECURITY DEFINER, dono com BYPASSRLS) insere mesmo assim.
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const dorI3 = (await db.query<{ out_dor_id: string }>(
      `select * from public.submeter_dor_landing(
         $1,$2,$3,$4,$5,$6,$7,$8,
         array['engenharia_de_software','nao_sei']::public.curso_ubm[]
       )`,
      [eid, 'minha dor real', 'Rep', 'Engenharia', 'Gerente', true, 'v1', new Date().toISOString()]
    )).rows[0]!
    expect(dorI3.out_dor_id).toBeTruthy()

    // Conta via service_role (sem RLS) → 2 cursos persistidos
    await comoServiceRole(db)
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from public.dor_curso where dor_id = $1`, [dorI3.out_dor_id]
    )).rows[0]!.n
    expect(n, 'os 2 cursos devem persistir via landing').toBe(2)
    await db.close()
  })

  it('I3: o autor (não verificado) consegue LER os próprios cursos via RLS', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const i3b = (await db.query<{ out_dor_id: string }>(
      `select * from public.submeter_dor_landing(
         $1,$2,$3,$4,$5,$6,$7,$8,
         array['direito']::public.curso_ubm[]
       )`,
      [eid, 'outra dor', 'Rep', 'Jurídico', 'Advogado', true, 'v1', new Date().toISOString()]
    )).rows[0]!.out_dor_id

    // Continua como REP (autor) — policy dor_curso_select_autor permite ver os próprios
    const cursos = (await db.query<{ curso: string }>(
      `select curso from public.dor_curso where dor_id = $1`, [i3b]
    )).rows.map((r) => r.curso)
    expect(cursos).toEqual(['direito'])
    await db.close()
  })

  it('I3: sem cursos (p_cursos null) não cria nenhuma linha em dor_curso', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    // Chamada posicional 8-arg → p_cursos usa o default null
    const i3c = (await db.query<{ out_dor_id: string }>(
      `select * from public.submeter_dor_landing($1,$2,$3,$4,$5,$6,$7,$8)`,
      [eid, 'dor sem cursos', 'Rep', 'TI', 'Dev', true, 'v1', new Date().toISOString()]
    )).rows[0]!.out_dor_id

    await comoServiceRole(db)
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from public.dor_curso where dor_id = $1`, [i3c]
    )).rows[0]!.n
    expect(n, 'sem cursos → 0 linhas').toBe(0)
    await db.close()
  })
})

// ─── RS-H1 HARDENING anon — has_function_privilege para amostra de RPCs admin ─
describe('0028 RS-H1 HARDENING anon — RPCs admin não executáveis por anon', () => {
  // Verifica via has_function_privilege que as RPCs críticas NÃO concedem execute a anon.
  // Complementa o teste RS-H1 da 0023 (que cobre PUBLIC via aclexplode/prosecdef).
  // Aqui testamos o role `anon` diretamente (gap confirmado no hospedado: Supabase auto-concede).

  it('RS-H1 anon: submeter_dor_landing — 9-arg (0028) não existe mais; 11-arg (0040) TEM execute para anon (porta anon SR-A1)', async () => {
    // 0040 fez drop+create com assinatura estendida (+ p_email + p_empresa_nome).
    // A 9-arg (0028) foi removida; a 11-arg é a ÚNICA porta de escrita anon (SR-A1).
    // Este teste ESTENDE a matriz 0028 (conforme tasks.md T-AN4): confirma que
    //   (a) a 9-arg não existe mais (sem regressão silenciosa de grant)
    //   (b) a 11-arg tem execute para anon (re-grant cirúrgico 0040 — SR-A-H1)
    const db = await novoBanco()

    // (a) 9-arg removida → has_function_privilege lança (função não existe)
    const throws9arg = await negado(
      db.query(
        `select has_function_privilege('anon',
           'public.submeter_dor_landing(uuid,text,text,text,text,boolean,text,timestamptz,public.curso_ubm[])',
           'execute') ok`
      )
    )
    expect(throws9arg, '9-arg de 0028 não deve mais existir após drop em 0040').toBe(true)

    // (b) 11-arg tem execute para anon (porta anon — SR-A1 confirmado)
    const r11 = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public.submeter_dor_landing(uuid,text,text,text,text,boolean,text,timestamptz,public.curso_ubm[],text,text)',
         'execute') ok`
    )).rows[0]!.ok
    expect(r11, '11-arg (0040) deve ter execute para anon (SR-A1 porta anon)').toBe(true)

    await db.close()
  })

  it('RS-H1 anon: moderar_dor NÃO é executável por anon', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public.moderar_dor(uuid,text,text)',
         'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em moderar_dor').toBe(false)
    await db.close()
  })

  it('RS-H1 anon: remover_anexo_admin NÃO é executável por anon', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public.remover_anexo_admin(uuid)',
         'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em remover_anexo_admin').toBe(false)
    await db.close()
  })

  it('RS-H1 anon: erasure_titular NÃO é executável por anon', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public.erasure_titular(uuid)',
         'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em erasure_titular').toBe(false)
    await db.close()
  })

  it('RS-H1 anon: criar_notificacao NÃO é executável por anon', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public.criar_notificacao(uuid,public.tipo_notificacao,jsonb,text,text,text)',
         'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em criar_notificacao').toBe(false)
    await db.close()
  })

  it('RS-H1 anon: quer_email NÃO é executável por anon', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public.quer_email(uuid,public.tipo_notificacao)',
         'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em quer_email').toBe(false)
    await db.close()
  })

  it('RS-H1 anon: onboarding_representante v2 (5-arg) NÃO é executável por anon', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public.onboarding_representante(uuid,text,text,text,text)',
         'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em onboarding_representante v2').toBe(false)
    await db.close()
  })

  it('RS-H1 anon: merge_empresa NÃO é executável por anon', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public.merge_empresa(uuid,uuid)',
         'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em merge_empresa').toBe(false)
    await db.close()
  })

  // Garante que as funções legítimas de anon NÃO foram revogadas (RS-H4 style)
  it('RS-H1 anon: is_admin() MANTÉM execute para anon (usada em RLS)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.is_admin()', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon deve manter execute em is_admin (RLS)').toBe(true)
    await db.close()
  })

  it('RS-H1 anon: buscar_empresa() MANTÉM execute para anon (landing pública)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.buscar_empresa(text)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon deve manter execute em buscar_empresa (landing)').toBe(true)
    await db.close()
  })

  it('RS-H1 anon: verificar_conta() MANTÉM execute para anon (link de e-mail)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.verificar_conta(text)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon deve manter execute em verificar_conta').toBe(true)
    await db.close()
  })
})
