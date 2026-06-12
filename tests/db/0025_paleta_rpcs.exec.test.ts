// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, negado } from './_pglite/harness'

// Onda O1 / T05–T09 — RPCs: resolver_paleta, salvar_paleta, ativar_paleta, excluir_paleta,
// restore_record('paleta') e hardening de grants.

const ADM = '00000000-0000-0000-0000-000000000010'
const REP = '00000000-0000-0000-0000-000000000011' // representante com empresa
const COORD = '00000000-0000-0000-0000-000000000012' // usuário sem empresa

const AZUL_LIGHT = {
  primary: '205 68% 33%',
  'primary-foreground': '0 0% 100%',
  accent: '345 62% 30%',
  'accent-foreground': '0 0% 100%',
  ring: '205 68% 33%',
}
const AZUL_DARK = {
  primary: '205 75% 62%',
  'primary-foreground': '216 40% 10%',
  accent: '345 60% 60%',
  'accent-foreground': '216 40% 10%',
  ring: '205 75% 62%',
}
const VERDE_LIGHT = {
  primary: '160 60% 35%',
  'primary-foreground': '0 0% 100%',
  accent: '345 62% 30%',
  'accent-foreground': '0 0% 100%',
  ring: '160 60% 35%',
}
const VERDE_DARK = {
  primary: '160 65% 55%',
  'primary-foreground': '216 40% 10%',
  accent: '345 60% 60%',
  'accent-foreground': '216 40% 10%',
  ring: '160 65% 55%',
}

async function comoAdmin(db: import('@electric-sql/pglite').PGlite, uid: string) {
  await db.exec(`reset role`)
  await db.exec(
    `insert into public.admin_app(user_id) values ('${uid}') on conflict do nothing`,
  )
  await comoUsuario(db, { uid, appMeta: { is_admin: true } })
}

/** Cria usuário, empresa, vincula como membro, e cria uma paleta aprovada para a empresa.
 *  Retorna { empId, paletaId }. Usa service_role para driblar RLS no setup. */
async function setupEmpresaComPaleta(
  db: import('@electric-sql/pglite').PGlite,
  adminUid: string,
  repUid: string,
  nomeEmpresa: string,
  tokens_light = VERDE_LIGHT,
  tokens_dark = VERDE_DARK,
): Promise<{ empId: string; paletaId: string }> {
  await db.exec(`reset role`)
  const empId = (
    await db.query<{ id: string }>(
      `insert into public.empresa(nome_canonico,created_by) values ('${nomeEmpresa}','${adminUid}') returning id`,
    )
  ).rows[0]!.id
  await db.exec(
    `insert into public.membro_empresa(user_id,empresa_id) values ('${repUid}','${empId}')`,
  )
  const paletaId = (
    await db.query<{ id: string }>(
      `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa,created_by)
       values ('empresa','${empId}','Paleta ${nomeEmpresa}',
               '${JSON.stringify(tokens_light)}',
               '${JSON.stringify(tokens_dark)}',
               true, true, '${adminUid}') returning id`,
    )
  ).rows[0]!.id
  return { empId, paletaId }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('0025 RPC resolver_paleta — T05: precedência', () => {
  it('rep com paleta empresa ativa+aprovada → recebe paleta da empresa (CA7)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com'),('${REP}','rep@e.com')`,
    )
    const { paletaId } = await setupEmpresaComPaleta(db, ADM, REP, 'Empresa Rep')
    void paletaId

    await comoUsuario(db, { uid: REP })
    const r = await db.query<{ tokens_light: unknown; tokens_dark: unknown }>(
      `select * from public.resolver_paleta('${REP}')`,
    )
    expect(r.rows).toHaveLength(1)
    const tl = r.rows[0]?.tokens_light as Record<string, string>
    // tokens_light da paleta da empresa (verde) != azul default
    expect(tl?.primary).toBe(VERDE_LIGHT.primary)
    await db.close()
  })

  it('rep SEM paleta custom ativa → recebe oficial ativa (CA8)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com'),('${REP}','rep@e.com')`,
    )
    // empresa sem paleta ativa (soft-delete a paleta ou não tem nenhuma)
    await db.exec(
      `insert into public.empresa(nome_canonico,created_by) values ('Empresa Vazia','${ADM}')`,
    )
    await comoUsuario(db, { uid: REP })
    const r = await db.query<{ tokens_light: unknown }>(
      `select * from public.resolver_paleta('${REP}')`,
    )
    expect(r.rows).toHaveLength(1)
    // sem empresa do rep — deve receber a oficial ativa (azul)
    const tl = r.rows[0]?.tokens_light as Record<string, string>
    expect(tl?.primary).toBe(AZUL_LIGHT.primary)
    await db.close()
  })

  it('anon (p_uid=NULL) → recebe oficial ativa (CA8b)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    const r = await db.query<{ tokens_light: unknown }>(
      `select * from public.resolver_paleta(null)`,
    )
    expect(r.rows).toHaveLength(1)
    const tl = r.rows[0]?.tokens_light as Record<string, string>
    expect(tl?.primary).toBe(AZUL_LIGHT.primary)
    await db.close()
  })

  it('usuário sem empresa → oficial ativa (CA8b — coord/admin/aluno)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${COORD}','coord@e.com')`,
    )
    await comoUsuario(db, { uid: COORD })
    const r = await db.query<{ tokens_light: unknown }>(
      `select * from public.resolver_paleta('${COORD}')`,
    )
    expect(r.rows).toHaveLength(1)
    const tl = r.rows[0]?.tokens_light as Record<string, string>
    expect(tl?.primary).toBe(AZUL_LIGHT.primary)
    await db.close()
  })

  it('empresa ativa + oficial ativa → empresa do usuário vence (CA9)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com'),('${REP}','rep@e.com')`,
    )
    await setupEmpresaComPaleta(db, ADM, REP, 'Empresa Precede')

    await comoUsuario(db, { uid: REP })
    const r = await db.query<{ tokens_light: unknown }>(
      `select * from public.resolver_paleta('${REP}')`,
    )
    expect(r.rows).toHaveLength(1)
    // verde da empresa vence sobre azul oficial
    const tl = r.rows[0]?.tokens_light as Record<string, string>
    expect(tl?.primary).toBe(VERDE_LIGHT.primary)
    await db.close()
  })

  it('nenhuma oficial ativa → fallback ENCAIXE embutido, nunca vazio (CA10)', async () => {
    const db = await novoBanco()
    // soft-deleta todas as oficiais (cenário extremo de fallback)
    await db.exec(`update public.paleta set ativa=false where escopo='oficial'`)
    await db.exec(`update public.paleta set deleted_at=now() where escopo='oficial'`)

    await comoAnon(db)
    const r = await db.query<{ tokens_light: unknown }>(
      `select * from public.resolver_paleta(null)`,
    )
    // deve retornar exatamente 1 linha (fallback)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]?.tokens_light).toBeTruthy()
    await db.close()
  })

  it('resolver_paleta é executável por anon (CA14)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    // não deve lançar permission denied
    const r = await db.query(
      `select * from public.resolver_paleta(null)`,
    )
    expect(r.rows).toHaveLength(1)
    await db.close()
  })

  it('empresa órfã (merged_into) é ignorada pelo resolver (RS-P15/CA9b)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com'),('${REP}','rep@e.com')`,
    )
    const { empId } = await setupEmpresaComPaleta(db, ADM, REP, 'Empresa Mergeada')
    // mergear a empresa: cria vencedora e aponta merged_into
    const winId = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Win','${ADM}') returning id`,
      )
    ).rows[0]!.id
    await db.exec(
      `update public.empresa set merged_into='${winId}', deleted_at=now() where id='${empId}'`,
    )

    await comoUsuario(db, { uid: REP })
    const r = await db.query<{ tokens_light: unknown }>(
      `select * from public.resolver_paleta('${REP}')`,
    )
    expect(r.rows).toHaveLength(1)
    // rep de empresa órfã cai na oficial (azul), não na paleta da empresa
    const tl = r.rows[0]?.tokens_light as Record<string, string>
    expect(tl?.primary).toBe(AZUL_LIGHT.primary)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B-007-02 (IMP-1): resolução determinística quando usuário é membro de 2+
// empresas com paleta empresa ativa+aprovada. Regra: empresa de vínculo mais
// antigo (membro_empresa.created_at ASC) vence; tie-break p.created_at ASC,
// p.id ASC. Asserta CA9 (determinístico) e que a paleta correta é retornada.
describe('0025 RPC resolver_paleta — T05b: determinismo multi-empresa (B-007-02/IMP-1)', () => {
  const USER_MULTI = '00000000-0000-0000-0000-000000000020'

  it('usuário membro de 2 empresas ambas com paleta ativa → empresa de vínculo mais antigo vence (CA9)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com'),('${USER_MULTI}','multi@e.com')`,
    )
    // reset para inserir diretamente (service_role)
    await db.exec(`reset role`)

    // ── cores distintas para distinguir as paletas ──────────────────────────
    const VERMELHO_LIGHT = {
      primary: '0 68% 45%',
      'primary-foreground': '0 0% 100%',
      accent: '345 62% 30%',
      'accent-foreground': '0 0% 100%',
      ring: '0 68% 45%',
    }
    const VERMELHO_DARK = {
      primary: '0 75% 62%',
      'primary-foreground': '216 40% 10%',
      accent: '345 60% 60%',
      'accent-foreground': '216 40% 10%',
      ring: '0 75% 62%',
    }

    // Empresa B — criada e vinculada PRIMEIRO (vínculo mais recente por semântica,
    // mas inserida antes → sem ORDER BY, LIMIT 1 pode escolher esta).
    // Seu vínculo tem created_at = now() (mais recente em semântica de negócio).
    const empBId = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa B Multi','${ADM}') returning id`,
      )
    ).rows[0]!.id
    await db.exec(
      `insert into public.membro_empresa(user_id,empresa_id)
       values ('${USER_MULTI}','${empBId}')`,
    )
    await db.query<{ id: string }>(
      `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa,created_by)
       values ('empresa','${empBId}','Paleta Empresa B',
               '${JSON.stringify(VERMELHO_LIGHT)}',
               '${JSON.stringify(VERMELHO_DARK)}',
               true, true, '${ADM}') returning id`,
    )

    // Empresa A — criada e vinculada DEPOIS, mas com created_at retroativo
    // (vínculo mais antigo em semântica de negócio: now() - 10 min).
    // Com ORDER BY me.created_at ASC, esta deve vencer.
    const empAId = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa A Multi','${ADM}') returning id`,
      )
    ).rows[0]!.id
    await db.exec(
      `insert into public.membro_empresa(user_id,empresa_id,created_at)
       values ('${USER_MULTI}','${empAId}', now() - interval '10 minutes')`,
    )
    await db.query<{ id: string }>(
      `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa,created_by)
       values ('empresa','${empAId}','Paleta Empresa A',
               '${JSON.stringify(VERDE_LIGHT)}',
               '${JSON.stringify(VERDE_DARK)}',
               true, true, '${ADM}') returning id`,
    )

    // Chama resolver_paleta como o usuário (3 vezes para verificar determinismo)
    await comoUsuario(db, { uid: USER_MULTI })
    const r1 = await db.query<{ tokens_light: unknown }>(
      `select * from public.resolver_paleta('${USER_MULTI}')`,
    )
    const r2 = await db.query<{ tokens_light: unknown }>(
      `select * from public.resolver_paleta('${USER_MULTI}')`,
    )
    const r3 = await db.query<{ tokens_light: unknown }>(
      `select * from public.resolver_paleta('${USER_MULTI}')`,
    )

    // (a) resultado determinístico — todas as chamadas retornam o mesmo
    const tl1 = r1.rows[0]?.tokens_light as Record<string, string>
    const tl2 = r2.rows[0]?.tokens_light as Record<string, string>
    const tl3 = r3.rows[0]?.tokens_light as Record<string, string>
    expect(tl1?.primary).toBe(tl2?.primary)
    expect(tl2?.primary).toBe(tl3?.primary)

    // (b) paleta esperada = Empresa A (vínculo mais antigo: created_at - 10 min)
    expect(
      tl1?.primary,
      'esperado verde (Empresa A, vínculo mais antigo); recebeu outra — resolver não é determinístico (B-007-02)',
    ).toBe(VERDE_LIGHT.primary)

    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0025 RPC salvar_paleta — T06: persistência só-admin', () => {
  it('não-admin chama salvar_paleta → raise "apenas admin" (RS-P9/P11)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${REP}','rep@e.com')`)
    await comoUsuario(db, { uid: REP })
    expect(
      await negado(
        db.query(
          `select public.salvar_paleta(
             null, 'oficial', null, 'Paleta Rep',
             '205 68% 33%',
             '${JSON.stringify(AZUL_LIGHT)}'::jsonb,
             '${JSON.stringify(AZUL_DARK)}'::jsonb
           )`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('admin salva com tokens HSL válidos → aprovada_aa=true (CA5)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    await comoAdmin(db, ADM)
    const r = await db.query<{ id: string }>(
      `select public.salvar_paleta(
         null, 'oficial', null, 'Azul Admin',
         '205 68% 33%',
         '${JSON.stringify(AZUL_LIGHT)}'::jsonb,
         '${JSON.stringify(AZUL_DARK)}'::jsonb
       ) as id`,
    )
    const pid = r.rows[0]?.id
    expect(pid).toBeTruthy()
    await db.exec(`reset role`)
    const paleta = await db.query<{ aprovada_aa: boolean }>(
      `select aprovada_aa from public.paleta where id='${pid}'`,
    )
    expect(paleta.rows[0]?.aprovada_aa).toBe(true)
    await db.close()
  })

  it('token malformado via salvar_paleta → falha no CHECK (RS-P3 última porta)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    await comoAdmin(db, ADM)
    const tokens_mal = JSON.stringify({ primary: 'red;}</style>', 'primary-foreground': '0 0% 100%', accent: '345 62% 30%', 'accent-foreground': '0 0% 100%', ring: '0 0% 0%' })
    expect(
      await negado(
        db.query(
          `select public.salvar_paleta(
             null, 'oficial', null, 'Malformado',
             '205 68% 33%',
             '${tokens_mal}'::jsonb,
             '${JSON.stringify(AZUL_DARK)}'::jsonb
           )`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('coerência escopo↔empresa_id respeitada: empresa sem empresa_id → erro', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    await comoAdmin(db, ADM)
    expect(
      await negado(
        db.query(
          `select public.salvar_paleta(
             null, 'empresa', null, 'Empresa sem ID',
             null,
             '${JSON.stringify(AZUL_LIGHT)}'::jsonb,
             '${JSON.stringify(AZUL_DARK)}'::jsonb
           )`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('empresa_id inexistente → FK nega (RS-B1)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    await comoAdmin(db, ADM)
    const fakeId = '99999999-9999-9999-9999-999999999999'
    expect(
      await negado(
        db.query(
          `select public.salvar_paleta(
             null, 'empresa', '${fakeId}', 'Empresa Inexistente',
             null,
             '${JSON.stringify(AZUL_LIGHT)}'::jsonb,
             '${JSON.stringify(AZUL_DARK)}'::jsonb
           )`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('editar paleta existente (p_id preenchido) → atualiza e retorna mesmo id', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    await comoAdmin(db, ADM)
    // criar
    const { rows: r1 } = await db.query<{ id: string }>(
      `select public.salvar_paleta(
         null,'oficial',null,'Azul Original',
         '205 68% 33%',
         '${JSON.stringify(AZUL_LIGHT)}'::jsonb,
         '${JSON.stringify(AZUL_DARK)}'::jsonb
       ) as id`,
    )
    const pid = r1[0]!.id
    // editar
    const { rows: r2 } = await db.query<{ id: string }>(
      `select public.salvar_paleta(
         '${pid}','oficial',null,'Azul Editada',
         '205 68% 33%',
         '${JSON.stringify(AZUL_LIGHT)}'::jsonb,
         '${JSON.stringify(AZUL_DARK)}'::jsonb
       ) as id`,
    )
    expect(r2[0]?.id).toBe(pid)
    await db.exec(`reset role`)
    const nome = await db.query<{ nome: string }>(
      `select nome from public.paleta where id='${pid}'`,
    )
    expect(nome.rows[0]?.nome).toBe('Azul Editada')
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0025 RPC ativar_paleta — T07: atômica anti-bypass AA', () => {
  it('ativar vermelho (oficial) desativa azul na mesma transação — nunca 2 oficiais ativas (CA1/CA2b)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    await comoAdmin(db, ADM)
    // pega o id do vermelho (oficial inativa)
    const vermelho = await db.query<{ id: string }>(
      `select id from public.paleta where escopo='oficial' and ativa=false`,
    )
    const vid = vermelho.rows[0]!.id
    await db.query(`select public.ativar_paleta('${vid}')`)
    await db.exec(`reset role`)
    // agora só vermelho ativo
    const ativas = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta where escopo='oficial' and ativa=true`,
    )
    expect(ativas.rows[0]?.n).toBe(1)
    const ativa = await db.query<{ id: string }>(
      `select id from public.paleta where escopo='oficial' and ativa=true`,
    )
    expect(ativa.rows[0]?.id).toBe(vid)
    await db.close()
  })

  it('ativar paleta de empresa desativa a ativa anterior da mesma empresa (CA7/RN4)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com'),('${REP}','rep@e.com')`,
    )
    const { empId, paletaId: p1 } = await setupEmpresaComPaleta(db, ADM, REP, 'Empresa Ativacao')
    // cria segunda paleta para a empresa (inativa)
    await db.exec(`reset role`)
    const p2 = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa)
         values ('empresa','${empId}','Paleta 2',
                 '${JSON.stringify(AZUL_LIGHT)}',
                 '${JSON.stringify(AZUL_DARK)}',
                 true, false) returning id`,
      )
    ).rows[0]!.id

    await comoAdmin(db, ADM)
    await db.query(`select public.ativar_paleta('${p2}')`)
    await db.exec(`reset role`)
    const p1ativa = await db.query<{ ativa: boolean }>(
      `select ativa from public.paleta where id='${p1}'`,
    )
    const p2ativa = await db.query<{ ativa: boolean }>(
      `select ativa from public.paleta where id='${p2}'`,
    )
    expect(p1ativa.rows[0]?.ativa).toBe(false)
    expect(p2ativa.rows[0]?.ativa).toBe(true)
    await db.close()
  })

  it('não-admin → raise (RS-P9/P11)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${REP}','rep@e.com')`)
    const azul = await db.query<{ id: string }>(
      `select id from public.paleta where escopo='oficial' and ativa=false`,
    )
    const vid = azul.rows[0]!.id
    await comoUsuario(db, { uid: REP })
    expect(
      await negado(db.query(`select public.ativar_paleta('${vid}')`)),
    ).toBe(true)
    await db.close()
  })

  it('paleta aprovada_aa=false → raise anti-bypass AA (CA6/VETO-P2)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    // inserir paleta reprovada (aprovada_aa=false, ativa=false)
    const pid = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,ativa)
         values ('oficial','Reprovada',
                 '${JSON.stringify(AZUL_LIGHT)}',
                 '${JSON.stringify(AZUL_DARK)}',
                 false, false) returning id`,
      )
    ).rows[0]!.id
    await comoAdmin(db, ADM)
    expect(
      await negado(db.query(`select public.ativar_paleta('${pid}')`)),
    ).toBe(true)
    await db.close()
  })

  it('paleta excluída (deleted_at) não pode ser ativada (CA15/CA16)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    const pid = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,ativa,deleted_at)
         values ('oficial','Deletada',
                 '${JSON.stringify(AZUL_LIGHT)}',
                 '${JSON.stringify(AZUL_DARK)}',
                 true, false, now()) returning id`,
      )
    ).rows[0]!.id
    await comoAdmin(db, ADM)
    expect(
      await negado(db.query(`select public.ativar_paleta('${pid}')`)),
    ).toBe(true)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0025 RPC excluir_paleta + restore_record — T08: soft-delete/restore', () => {
  it('excluir_paleta (admin) → deleted_at setado, ativa=false, some da leitura pública (CA15)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    const pid = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,ativa)
         values ('oficial','Para Excluir',
                 '${JSON.stringify(AZUL_LIGHT)}',
                 '${JSON.stringify(AZUL_DARK)}',
                 true,false) returning id`,
      )
    ).rows[0]!.id
    await comoAdmin(db, ADM)
    await db.query(`select public.excluir_paleta('${pid}')`)
    await db.exec(`reset role`)
    // campo deleted_at preenchido e ativa=false
    const estado = await db.query<{ deleted_at: unknown; ativa: boolean }>(
      `select deleted_at, ativa from public.paleta where id='${pid}'`,
    )
    expect(estado.rows[0]?.deleted_at).toBeTruthy()
    expect(estado.rows[0]?.ativa).toBe(false)
    // some da leitura pública (anon)
    await comoAnon(db)
    const visivel = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta where id='${pid}'`,
    )
    expect(visivel.rows[0]?.n).toBe(0)
    await db.close()
  })

  it('admin enxerga paleta excluída (CA15)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    const pid = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
         values ('oficial','Para Excluir Admin',
                 '${JSON.stringify(AZUL_LIGHT)}',
                 '${JSON.stringify(AZUL_DARK)}',
                 true) returning id`,
      )
    ).rows[0]!.id
    await comoAdmin(db, ADM)
    await db.query(`select public.excluir_paleta('${pid}')`)
    // admin ainda enxerga
    const adm = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta where id='${pid}'`,
    )
    expect(adm.rows[0]?.n).toBe(1)
    await db.close()
  })

  it('restore_record("paleta", id) → deleted_at=null, volta a circular (CA16)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    const pid = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
         values ('oficial','Para Restaurar',
                 '${JSON.stringify(AZUL_LIGHT)}',
                 '${JSON.stringify(AZUL_DARK)}',
                 true) returning id`,
      )
    ).rows[0]!.id
    await comoAdmin(db, ADM)
    await db.query(`select public.excluir_paleta('${pid}')`)
    // restaurar
    await db.query(`select public.restore_record('paleta','${pid}')`)
    await db.exec(`reset role`)
    // deleted_at=null
    const estado = await db.query<{ deleted_at: unknown }>(
      `select deleted_at from public.paleta where id='${pid}'`,
    )
    expect(estado.rows[0]?.deleted_at).toBeNull()
    // anon enxerga de volta
    await comoAnon(db)
    const visivel = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta where id='${pid}'`,
    )
    expect(visivel.rows[0]?.n).toBe(1)
    await db.close()
  })

  it('restore_record("paleta") não reativa automaticamente (só remove soft-delete)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    const pid = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa,ativa)
         values ('oficial','Para Restaurar Inativa',
                 '${JSON.stringify(AZUL_LIGHT)}',
                 '${JSON.stringify(AZUL_DARK)}',
                 true,false) returning id`,
      )
    ).rows[0]!.id
    await comoAdmin(db, ADM)
    await db.query(`select public.excluir_paleta('${pid}')`)
    await db.query(`select public.restore_record('paleta','${pid}')`)
    await db.exec(`reset role`)
    const estado = await db.query<{ ativa: boolean }>(
      `select ativa from public.paleta where id='${pid}'`,
    )
    expect(estado.rows[0]?.ativa).toBe(false) // ainda inativa, não reativou
    await db.close()
  })

  it('não-admin em excluir_paleta → raise', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${REP}','rep@e.com')`)
    const pid = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
         values ('oficial','Protegida',
                 '${JSON.stringify(AZUL_LIGHT)}',
                 '${JSON.stringify(AZUL_DARK)}',
                 true) returning id`,
      )
    ).rows[0]!.id
    await comoUsuario(db, { uid: REP })
    expect(
      await negado(db.query(`select public.excluir_paleta('${pid}')`)),
    ).toBe(true)
    await db.close()
  })

  it('não-admin em restore_record("paleta") → raise', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${REP}','rep@e.com')`)
    await comoUsuario(db, { uid: REP })
    const fakeId = '00000000-0000-0000-0000-000000000099'
    expect(
      await negado(db.query(`select public.restore_record('paleta','${fakeId}')`)),
    ).toBe(true)
    await db.close()
  })

  it('excluir+restore auditados (RN11/CA17)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${ADM}','adm@e.com')`)
    const pid = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,nome,tokens_light,tokens_dark,aprovada_aa)
         values ('oficial','Auditada',
                 '${JSON.stringify(AZUL_LIGHT)}',
                 '${JSON.stringify(AZUL_DARK)}',
                 true) returning id`,
      )
    ).rows[0]!.id
    await comoAdmin(db, ADM)
    await db.query(`select public.excluir_paleta('${pid}')`)
    await db.query(`select public.restore_record('paleta','${pid}')`)
    await db.exec(`reset role`)
    const aud = await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version
       where tabela='public.paleta' and record_id='${pid}'`,
    )
    expect(aud.rows[0]?.n).toBeGreaterThanOrEqual(2) // INSERT + UPDATE(excluir) + RESTORE
    const restore = await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version
       where tabela='public.paleta' and record_id='${pid}' and op='RESTORE'`,
    )
    expect(restore.rows[0]?.n).toBeGreaterThan(0)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0025 hardening grants — T09: revoke/grant mínimos', () => {
  it('RS-H1: nenhuma RPC de paleta SECURITY DEFINER com execute para PUBLIC', async () => {
    const db = await novoBanco()
    const falhas = (
      await db.query<{ proname: string }>(
        `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('resolver_paleta','salvar_paleta','ativar_paleta','excluir_paleta')
           and p.prosecdef = true
           and (
             select count(*) > 0
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE'
           )`,
      )
    ).rows
    const nomes = falhas.map((r) => r.proname)
    expect(
      nomes,
      `RPCs paleta com EXECUTE para PUBLIC (deve ser zero): ${nomes.join(', ')}`,
    ).toHaveLength(0)
    await db.close()
  })

  it('resolver_paleta é executável por anon (leitura pública — CA14)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    const r = await db.query(`select * from public.resolver_paleta(null)`)
    expect(r.rows).toHaveLength(1)
    await db.close()
  })

  it('salvar_paleta NÃO executável por anon (E-P04)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    expect(
      await negado(
        db.query(
          `select public.salvar_paleta(null,'oficial',null,'T',null,'${JSON.stringify(AZUL_LIGHT)}'::jsonb,'${JSON.stringify(AZUL_DARK)}'::jsonb)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })

  it('ativar_paleta NÃO executável por anon (E-P04)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    const pid = '00000000-0000-0000-0000-000000000099'
    expect(
      await negado(db.query(`select public.ativar_paleta('${pid}')`)),
    ).toBe(true)
    await db.close()
  })

  it('excluir_paleta NÃO executável por anon (E-P04)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    const pid = '00000000-0000-0000-0000-000000000099'
    expect(
      await negado(db.query(`select public.excluir_paleta('${pid}')`)),
    ).toBe(true)
    await db.close()
  })

  it('gate is_admin() interno mantido após revoke (salvar_paleta authenticated não-admin → raise)', async () => {
    const db = await novoBanco()
    await db.exec(`insert into auth.users(id,email) values ('${REP}','rep@e.com')`)
    await comoUsuario(db, { uid: REP }) // authenticated mas não-admin
    expect(
      await negado(
        db.query(
          `select public.salvar_paleta(null,'oficial',null,'T',null,'${JSON.stringify(AZUL_LIGHT)}'::jsonb,'${JSON.stringify(AZUL_DARK)}'::jsonb)`,
        ),
      ),
    ).toBe(true)
    await db.close()
  })
})
