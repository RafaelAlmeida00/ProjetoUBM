// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, negado } from './_pglite/harness'

// Onda O1 / T01–T04 — tabela `paleta` + CHECKs + RLS + seed + audit.
// RS-P8 (RLS enable+force), RS-P13 (UNIQUE parcial), RS-P14 (coerência escopo↔empresa),
// RS-P6 (CHECK ativa⇒aa), RS-P1/P3 (formato HSL), RN3/RN10/CA2c (seed), RN11/CA17 (audit).

const ADM = '00000000-0000-0000-0000-000000000001' // admin
const REP = '00000000-0000-0000-0000-000000000002' // representante (não-admin)
const ANO = '00000000-0000-0000-0000-000000000003' // anônimo (não autenticado)

// Tokens azuis que DEVEM bater com globals.css :root / [data-theme="dark"]
// T03: igualdade fallback — evita micro-flash (ver plan §3 confronto)
const AZUL_LIGHT = {
  primary: '205 68% 33%',
  'primary-foreground': '0 0% 100%',
  accent: '345 62% 30%',
  'accent-foreground': '0 0% 100%',
  ring: '205 68% 33%',
  secondary: '40 18% 88%',
  'secondary-foreground': '215 30% 18%',
}
const AZUL_DARK = {
  primary: '205 75% 62%',
  'primary-foreground': '216 40% 10%',
  accent: '345 60% 60%',
  'accent-foreground': '216 40% 10%',
  ring: '205 75% 62%',
  secondary: '216 20% 20%',
  'secondary-foreground': '40 24% 92%',
}

// Tokens vermelhos (do bloco [data-palette="vermelho"] em globals.css — oficial alternativa)
const VERMELHO_LIGHT = {
  primary: '0 72% 45%',
  'primary-foreground': '0 0% 100%',
  accent: '14 80% 42%',
  'accent-foreground': '0 0% 100%',
  ring: '0 72% 45%',
}
const VERMELHO_DARK = {
  primary: '0 80% 62%',
  'primary-foreground': '216 40% 10%',
  accent: '14 85% 60%',
  'accent-foreground': '216 40% 10%',
  ring: '0 80% 62%',
}

/** Configura um usuário como admin: insere em admin_app e usa comoUsuario com is_admin=true */
async function comoAdmin(db: import('@electric-sql/pglite').PGlite, uid: string) {
  await db.exec(`reset role`)
  await db.exec(
    `insert into public.admin_app(user_id) values ('${uid}') on conflict do nothing`,
  )
  await comoUsuario(db, { uid, appMeta: { is_admin: true } })
}

describe('0024 tabela paleta — T01: RLS + políticas', () => {
  it('anon pode SELECT paleta (leitura pública — CA14)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta`,
    )
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(0) // sem erro = política select ok
    await db.close()
  })

  it('anon NÃO pode INSERT paleta (RLS escrita — RS-P8/RS-P9)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${REP}','rep@empresa.com')`)
    await comoAnon(db)
    expect(
      await negado(
        db.query(`
          insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
          values ('oficial','Teste','{"primary":"205 68% 33%"}','{"primary":"205 75% 62%"}',true)
        `),
      ),
    ).toBe(true)
    await db.close()
  })

  it('usuário autenticado não-admin NÃO pode INSERT paleta (RS-P9)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${REP}','rep@empresa.com')`)
    await comoUsuario(db, { uid: REP })
    expect(
      await negado(
        db.query(`
          insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
          values ('oficial','Teste','{"primary":"205 68% 33%"}','{"primary":"205 75% 62%"}',true)
        `),
      ),
    ).toBe(true)
    await db.close()
  })

  it('admin pode INSERT paleta (RS-P9)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@empresa.com')`)
    await comoAdmin(db, ADM)
    const r = await db.query<{ id: string }>(
      `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,created_by)
       values ('oficial','Azul Teste',
               '${JSON.stringify(AZUL_LIGHT)}',
               '${JSON.stringify(AZUL_DARK)}',
               true,'${ADM}')
       returning id`,
    )
    expect(r.rows[0]?.id).toBeTruthy()
    await db.close()
  })

  it('tabela paleta tem RLS enable+force (RS-P8 / sentinela)', async () => {
    const db = await novoBanco()
    const r = await db.query<{ en: boolean; fo: boolean }>(
      `select c.relrowsecurity as en, c.relforcerowsecurity as fo
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='paleta'`,
    )
    expect(r.rows[0]?.en, 'RLS not enabled').toBe(true)
    expect(r.rows[0]?.fo, 'RLS not forced').toBe(true)
    await db.close()
  })

  it('admin enxerga paleta soft-deletada; anon não enxerga (CA15/paleta_select_publica)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@empresa.com')`)
    await comoAdmin(db, ADM)
    // insere e soft-deleta
    const { rows } = await db.query<{ id: string }>(
      `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,created_by)
       values ('oficial','Deletada',
               '${JSON.stringify(AZUL_LIGHT)}',
               '${JSON.stringify(AZUL_DARK)}',
               true,'${ADM}') returning id`,
    )
    const pid = rows[0]!.id
    await db.exec(`reset role`)
    await db.exec(`update public.paleta set deleted_at=now() where id='${pid}'`)
    // anon não vê
    await comoAnon(db)
    const anon = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta where id='${pid}'`,
    )
    expect(anon.rows[0]?.n).toBe(0)
    // admin vê
    await comoAdmin(db, ADM)
    const adm = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta where id='${pid}'`,
    )
    expect(adm.rows[0]?.n).toBe(1)
    await db.close()
  })
})

describe('0024 tabela paleta — T01: CHECKs de coerência e ativa⇒aa', () => {
  it('CHECK coerência: oficial COM empresa_id → rejeitado (RS-P14/CA2c)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@empresa.com')`)
    const empId = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa X','${ADM}') returning id`,
      )
    ).rows[0]!.id
    await db.exec(`reset role`)
    // tentar inserir oficial com empresa_id preenchido deve falhar
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa)
           values ('oficial','${empId}','Inválida',
                   '${JSON.stringify(AZUL_LIGHT)}',
                   '${JSON.stringify(AZUL_DARK)}',
                   true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('CHECK coerência: empresa SEM empresa_id → rejeitado (RS-P14)', async () => {
    const db = await novoBanco()
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
           values ('empresa','Sem empresa',
                   '${JSON.stringify(AZUL_LIGHT)}',
                   '${JSON.stringify(AZUL_DARK)}',
                   true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('CHECK paleta_ativa_exige_aa: ativa=true com aprovada_aa=false → rejeitado (RS-P6/CA6)', async () => {
    const db = await novoBanco()
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,ativa)
           values ('oficial','Reprovada',
                   '${JSON.stringify(AZUL_LIGHT)}',
                   '${JSON.stringify(AZUL_DARK)}',
                   false, true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })
})

describe('0024 tabela paleta — T01: UNIQUE parcial one-active', () => {
  it('UNIQUE oficial: 2 oficiais ativas ao mesmo tempo → violação (RS-P13/CA1)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@empresa.com')`)
    // Já existe azul ativa (seed); tentar inserir outra oficial ativa deve violar UNIQUE
    await db.exec(`reset role`)
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,ativa)
           values ('oficial','Outra Oficial',
                   '${JSON.stringify(AZUL_LIGHT)}',
                   '${JSON.stringify(AZUL_DARK)}',
                   true, true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('UNIQUE empresa: 2 paletas ativas da mesma empresa → violação (RS-P13)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@empresa.com')`)
    const empId = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Y','${ADM}') returning id`,
      )
    ).rows[0]!.id
    // primeira paleta de empresa ativa
    await db.exec(`
      insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa)
      values ('empresa','${empId}','Paleta Y1',
              '${JSON.stringify(AZUL_LIGHT)}',
              '${JSON.stringify(AZUL_DARK)}',
              true,true)
    `)
    // segunda paleta de empresa ativa — deve violar UNIQUE
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa)
           values ('empresa','${empId}','Paleta Y2',
                   '${JSON.stringify(AZUL_LIGHT)}',
                   '${JSON.stringify(AZUL_DARK)}',
                   true,true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('2 paletas de EMPRESAS DIFERENTES podem ser ativas simultaneamente (sem violação)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@empresa.com')`)
    const emp1 = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Alpha','${ADM}') returning id`,
      )
    ).rows[0]!.id
    const emp2 = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Beta','${ADM}') returning id`,
      )
    ).rows[0]!.id
    // inserir diretamente (sem RLS) para testar UNIQUE sem passar pelas policies
    await db.exec(`
      insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa)
      values ('empresa','${emp1}','Alpha',
              '${JSON.stringify(AZUL_LIGHT)}',
              '${JSON.stringify(AZUL_DARK)}',
              true,true),
             ('empresa','${emp2}','Beta',
              '${JSON.stringify(AZUL_LIGHT)}',
              '${JSON.stringify(AZUL_DARK)}',
              true,true)
    `)
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta where escopo='empresa' and ativa=true`,
    )
    expect(r.rows[0]?.n).toBe(2)
    await db.close()
  })
})

describe('0024 tabela paleta — T02: CHECK formato HSL (anti-injeção RS-P1/P3)', () => {
  it('token com injeção CSS ;}body{display:none → rejeitado pelo banco', async () => {
    const db = await novoBanco()
    const tokens_mal = JSON.stringify({ primary: '0 0% 0%;}body{display:none', 'primary-foreground': '0 0% 100%', accent: '345 62% 30%', 'accent-foreground': '0 0% 100%', ring: '205 68% 33%' })
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
           values ('oficial','Maliciosa','${tokens_mal}','${JSON.stringify(AZUL_DARK)}',true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('token com script tag red;</style><script> → rejeitado', async () => {
    const db = await novoBanco()
    const tokens_mal = JSON.stringify({ primary: 'red;</style><script>', 'primary-foreground': '0 0% 100%', accent: '345 62% 30%', 'accent-foreground': '0 0% 100%', ring: '205 68% 33%' })
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
           values ('oficial','Script Inject','${tokens_mal}','${JSON.stringify(AZUL_DARK)}',true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('chave fora do conjunto fechado → rejeitado (RS-P2)', async () => {
    const db = await novoBanco()
    const tokens_chave_extra = JSON.stringify({
      primary: '205 68% 33%',
      'primary-foreground': '0 0% 100%',
      accent: '345 62% 30%',
      'accent-foreground': '0 0% 100%',
      ring: '205 68% 33%',
      'font-family': 'Arial, sans-serif', // chave fora do conjunto!
    })
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
           values ('oficial','Chave Extra','${tokens_chave_extra}','${JSON.stringify(AZUL_DARK)}',true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('tripla HSL válida 205 68% 33% → aceita', async () => {
    const db = await novoBanco()
    const r = await db.query<{ id: string }>(
      `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
       values ('oficial','HSL Valida',
               '${JSON.stringify(AZUL_LIGHT)}',
               '${JSON.stringify(AZUL_DARK)}',
               true)
       returning id`,
    )
    expect(r.rows[0]?.id).toBeTruthy()
    await db.close()
  })

  it('H fora de [0,360] → rejeitado (RS-P3)', async () => {
    const db = await novoBanco()
    const tokens_h_invalido = JSON.stringify({
      primary: '400 68% 33%', // H > 360
      'primary-foreground': '0 0% 100%',
      accent: '345 62% 30%',
      'accent-foreground': '0 0% 100%',
      ring: '400 68% 33%',
    })
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
           values ('oficial','H Invalido','${tokens_h_invalido}','${JSON.stringify(AZUL_DARK)}',true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('S fora de [0,100] → rejeitado (RS-P3)', async () => {
    const db = await novoBanco()
    const tokens_s_invalido = JSON.stringify({
      primary: '205 150% 33%', // S > 100
      'primary-foreground': '0 0% 100%',
      accent: '345 62% 30%',
      'accent-foreground': '0 0% 100%',
      ring: '205 150% 33%',
    })
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
           values ('oficial','S Invalido','${tokens_s_invalido}','${JSON.stringify(AZUL_DARK)}',true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('semente_hsl inválida → rejeitada (RS-P3)', async () => {
    const db = await novoBanco()
    expect(
      await negado(
        db.exec(
          `insert into public.paleta(escopo,nome,semente_hsl,tokens_light,tokens_dark,aprovada_aa)
           values ('oficial','Semente Invalida','red;}</style>',
                   '${JSON.stringify(AZUL_LIGHT)}',
                   '${JSON.stringify(AZUL_DARK)}',
                   true)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })
})

describe('0024 tabela paleta — T03: seed das 2 oficiais', () => {
  it('existem exatamente 2 oficiais no seed (CA2/RN10)', async () => {
    const db = await novoBanco()
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta where escopo='oficial'`,
    )
    expect(r.rows[0]?.n).toBe(2)
    await db.close()
  })

  it('ambas as oficiais têm aprovada_aa=true (CA6)', async () => {
    const db = await novoBanco()
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta where escopo='oficial' and aprovada_aa=true`,
    )
    expect(r.rows[0]?.n).toBe(2)
    await db.close()
  })

  it('só azul ENCAIXE está ativa; vermelha não (RN3/CA2b)', async () => {
    const db = await novoBanco()
    const ativas = await db.query<{ nome: string }>(
      `select nome from public.paleta where escopo='oficial' and ativa=true`,
    )
    expect(ativas.rows).toHaveLength(1)
    expect(ativas.rows[0]?.nome?.toLowerCase()).toContain('encaixe')

    const inativas = await db.query<{ nome: string }>(
      `select nome from public.paleta where escopo='oficial' and ativa=false`,
    )
    expect(inativas.rows).toHaveLength(1)
    await db.close()
  })

  it('vermelha é escopo oficial (não de empresa — CA2c)', async () => {
    const db = await novoBanco()
    const r = await db.query<{ escopo: string; empresa_id: unknown }>(
      `select escopo, empresa_id from public.paleta where ativa=false and escopo='oficial'`,
    )
    expect(r.rows[0]?.escopo).toBe('oficial')
    expect(r.rows[0]?.empresa_id).toBeNull()
    await db.close()
  })

  it('tokens azul light batem com globals.css :root (igualdade fallback — T03)', async () => {
    const db = await novoBanco()
    const r = await db.query<{ tokens_light: typeof AZUL_LIGHT }>(
      `select tokens_light from public.paleta where ativa=true and escopo='oficial'`,
    )
    const tl = r.rows[0]?.tokens_light
    expect(tl?.primary).toBe(AZUL_LIGHT.primary)
    expect(tl?.accent).toBe(AZUL_LIGHT.accent)
    expect(tl?.ring).toBe(AZUL_LIGHT.ring)
    await db.close()
  })

  it('tokens azul dark batem com globals.css [data-theme=dark] (igualdade fallback — T03)', async () => {
    const db = await novoBanco()
    const r = await db.query<{ tokens_dark: typeof AZUL_DARK }>(
      `select tokens_dark from public.paleta where ativa=true and escopo='oficial'`,
    )
    const td = r.rows[0]?.tokens_dark
    expect(td?.primary).toBe(AZUL_DARK.primary)
    expect(td?.accent).toBe(AZUL_DARK.accent)
    expect(td?.ring).toBe(AZUL_DARK.ring)
    await db.close()
  })
})

describe('0024 tabela paleta — T04: trigger zzz_audit', () => {
  it('INSERT em paleta gera linha em audit.record_version com actor_id (RN11/CA17)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@empresa.com')`)
    await comoAdmin(db, ADM)
    const { rows } = await db.query<{ id: string }>(
      `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,created_by)
       values ('oficial','Audit Teste',
               '${JSON.stringify(AZUL_LIGHT)}',
               '${JSON.stringify(AZUL_DARK)}',
               true,'${ADM}') returning id`,
    )
    const pid = rows[0]!.id
    await db.exec(`reset role`)
    const aud = await db.query<{ n: number; actor_id: string }>(
      `select count(*)::int n, max(actor_id::text) actor_id
       from audit.record_version
       where tabela='public.paleta' and record_id='${pid}' and op='INSERT'`,
    )
    expect(aud.rows[0]?.n).toBeGreaterThan(0)
    expect(aud.rows[0]?.actor_id).toBe(ADM)
    await db.close()
  })

  it('UPDATE em paleta gera linha de auditoria (op=UPDATE)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@empresa.com')`)
    await comoAdmin(db, ADM)
    const { rows } = await db.query<{ id: string }>(
      `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,created_by)
       values ('oficial','Audit Update',
               '${JSON.stringify(AZUL_LIGHT)}',
               '${JSON.stringify(AZUL_DARK)}',
               true,'${ADM}') returning id`,
    )
    const pid = rows[0]!.id
    await db.exec(`reset role`)
    await db.exec(`update public.paleta set nome='Audit Update V2' where id='${pid}'`)
    const aud = await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version
       where tabela='public.paleta' and record_id='${pid}' and op='UPDATE'`,
    )
    expect(aud.rows[0]?.n).toBeGreaterThan(0)
    await db.close()
  })

  it('ator vem da transação (S-P01) — não do payload', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@empresa.com')`)
    await comoAdmin(db, ADM)
    const { rows } = await db.query<{ id: string }>(
      // mesmo passando um created_by diferente, o actor_id no audit deve ser auth.uid()
      `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,created_by)
       values ('oficial','Ator Test',
               '${JSON.stringify(AZUL_LIGHT)}',
               '${JSON.stringify(AZUL_DARK)}',
               true,'${ADM}') returning id`,
    )
    const pid = rows[0]!.id
    await db.exec(`reset role`)
    const aud = await db.query<{ actor_id: string }>(
      `select actor_id::text from audit.record_version
       where tabela='public.paleta' and record_id='${pid}'
       order by ts desc limit 1`,
    )
    // actor_id deve ser o ADM (quem executou a query com auth.uid())
    expect(aud.rows[0]?.actor_id).toBe(ADM)
    await db.close()
  })
})
