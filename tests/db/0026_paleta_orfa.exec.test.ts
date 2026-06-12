// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario } from './_pglite/harness'

// Onda O1 / T10 — trigger _paleta_desativa_orfa (RN12/CA9b).
// Empresa mesclada (merged_into) ou soft-deletada → paleta ativa de empresa fica ativa=false.
// Paleta não migra para vencedora do merge. Representante resolve oficial/fallback.

const ADM = '00000000-0000-0000-0000-000000000020'
const REP = '00000000-0000-0000-0000-000000000021'

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

describe('0026 trigger _paleta_desativa_orfa — T10', () => {
  it('merge de empresa X (merged_into) → paleta de X fica ativa=false (CA9b/RN12)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com'),('${REP}','rep@e.com')`,
    )
    // cria empresa X e paleta ativa
    const empX = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa X','${ADM}') returning id`,
      )
    ).rows[0]!.id
    await db.exec(
      `insert into public.membro_empresa(user_id,empresa_id) values ('${REP}','${empX}')`,
    )
    const paletaX = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa,created_by)
         values ('empresa','${empX}','Paleta X',
                 '${JSON.stringify(VERDE_LIGHT)}',
                 '${JSON.stringify(VERDE_DARK)}',
                 true,true,'${ADM}') returning id`,
      )
    ).rows[0]!.id

    // cria vencedora do merge
    const empWin = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Win','${ADM}') returning id`,
      )
    ).rows[0]!.id

    // simula merge (merged_into)
    await db.exec(`reset role`)
    await db.exec(
      `update public.empresa set merged_into='${empWin}', deleted_at=now() where id='${empX}'`,
    )

    const estado = await db.query<{ ativa: boolean }>(
      `select ativa from public.paleta where id='${paletaX}'`,
    )
    expect(estado.rows[0]?.ativa, 'paleta de empresa mergeada deve ficar ativa=false').toBe(false)
    await db.close()
  })

  it('soft-delete de empresa → paleta ativa fica ativa=false (CA9b/RN12)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com'),('${REP}','rep@e.com')`,
    )
    const empX = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Soft','${ADM}') returning id`,
      )
    ).rows[0]!.id
    const paletaX = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa,created_by)
         values ('empresa','${empX}','Paleta Soft',
                 '${JSON.stringify(VERDE_LIGHT)}',
                 '${JSON.stringify(VERDE_DARK)}',
                 true,true,'${ADM}') returning id`,
      )
    ).rows[0]!.id

    await db.exec(`reset role`)
    // soft-delete da empresa
    await db.exec(
      `update public.empresa set deleted_at=now() where id='${empX}'`,
    )

    const estado = await db.query<{ ativa: boolean }>(
      `select ativa from public.paleta where id='${paletaX}'`,
    )
    expect(estado.rows[0]?.ativa, 'paleta de empresa soft-deletada deve ficar ativa=false').toBe(false)
    await db.close()
  })

  it('paleta NÃO migra para a vencedora do merge (RN12)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com'),('${REP}','rep@e.com')`,
    )
    const empX = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Perdedora','${ADM}') returning id`,
      )
    ).rows[0]!.id
    const empWin = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Ganhadora','${ADM}') returning id`,
      )
    ).rows[0]!.id
    const paletaX = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa,created_by)
         values ('empresa','${empX}','Paleta Perdedora',
                 '${JSON.stringify(VERDE_LIGHT)}',
                 '${JSON.stringify(VERDE_DARK)}',
                 true,true,'${ADM}') returning id`,
      )
    ).rows[0]!.id

    await db.exec(`reset role`)
    await db.exec(
      `update public.empresa set merged_into='${empWin}', deleted_at=now() where id='${empX}'`,
    )

    // a paleta continua com empresa_id = empX (não migrou para empWin)
    const paleta = await db.query<{ empresa_id: string }>(
      `select empresa_id::text from public.paleta where id='${paletaX}'`,
    )
    expect(paleta.rows[0]?.empresa_id).toBe(empX) // empresa_id inalterado
    // nenhuma paleta foi criada para empWin
    const novaWin = await db.query<{ n: number }>(
      `select count(*)::int n from public.paleta where empresa_id='${empWin}'`,
    )
    expect(novaWin.rows[0]?.n).toBe(0)
    await db.close()
  })

  it('representante de empresa órfã passa a resolver oficial/fallback (T05 × T10)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com'),('${REP}','rep@e.com')`,
    )
    const empX = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Orfa','${ADM}') returning id`,
      )
    ).rows[0]!.id
    await db.exec(
      `insert into public.membro_empresa(user_id,empresa_id) values ('${REP}','${empX}')`,
    )
    await db.query<{ id: string }>(
      `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa,created_by)
       values ('empresa','${empX}','Paleta Orfa',
               '${JSON.stringify(VERDE_LIGHT)}',
               '${JSON.stringify(VERDE_DARK)}',
               true,true,'${ADM}') returning id`,
    )
    const empWin = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Win Orfa','${ADM}') returning id`,
      )
    ).rows[0]!.id

    await db.exec(`reset role`)
    await db.exec(
      `update public.empresa set merged_into='${empWin}', deleted_at=now() where id='${empX}'`,
    )

    // rep agora deve receber a oficial ativa (azul)
    await comoUsuario(db, { uid: REP })
    const r = await db.query<{ tokens_light: Record<string, string> }>(
      `select * from public.resolver_paleta('${REP}')`,
    )
    expect(r.rows).toHaveLength(1)
    // cai na oficial azul (não verde da empresa órfã)
    expect(r.rows[0]?.tokens_light?.primary).toBe(AZUL_LIGHT.primary)
    await db.close()
  })

  it('desativação da paleta órfã é auditada (RN11)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com')`,
    )
    const empX = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Audit Orfa','${ADM}') returning id`,
      )
    ).rows[0]!.id
    const paletaX = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa,created_by)
         values ('empresa','${empX}','Paleta Audit Orfa',
                 '${JSON.stringify(VERDE_LIGHT)}',
                 '${JSON.stringify(VERDE_DARK)}',
                 true,true,'${ADM}') returning id`,
      )
    ).rows[0]!.id

    await db.exec(`reset role`)
    await db.exec(
      `update public.empresa set deleted_at=now() where id='${empX}'`,
    )

    // deve existir linha de auditoria UPDATE na paleta
    const aud = await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version
       where tabela='public.paleta' and record_id='${paletaX}' and op='UPDATE'`,
    )
    expect(aud.rows[0]?.n).toBeGreaterThan(0)
    await db.close()
  })

  it('empresa inativa que já tinha merged_into/deleted_at não dispara novamente (idempotência)', async () => {
    const db = await novoBanco()
    await db.exec(
      `insert into auth.users(id,email) values ('${ADM}','adm@e.com')`,
    )
    const empX = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Empresa Idem','${ADM}') returning id`,
      )
    ).rows[0]!.id
    const empWin = (
      await db.query<{ id: string }>(
        `insert into public.empresa(nome_canonico,created_by) values ('Win Idem','${ADM}') returning id`,
      )
    ).rows[0]!.id
    // Primeiro: paleta ativa + merge
    const paletaX = (
      await db.query<{ id: string }>(
        `insert into public.paleta(escopo,empresa_id,nome,tokens_light,tokens_dark,aprovada_aa,ativa,created_by)
         values ('empresa','${empX}','Paleta Idem',
                 '${JSON.stringify(VERDE_LIGHT)}',
                 '${JSON.stringify(VERDE_DARK)}',
                 true,true,'${ADM}') returning id`,
      )
    ).rows[0]!.id

    await db.exec(`reset role`)
    await db.exec(
      `update public.empresa set merged_into='${empWin}', deleted_at=now() where id='${empX}'`,
    )

    // contar linhas de audit UPDATE na paleta antes do segundo update
    const antes = await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version
       where tabela='public.paleta' and record_id='${paletaX}' and op='UPDATE'`,
    )

    // segundo update na empresa (já está merged_into) — não deve disparar de novo
    await db.exec(
      `update public.empresa set updated_at=now() where id='${empX}'`,
    )

    const depois = await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version
       where tabela='public.paleta' and record_id='${paletaX}' and op='UPDATE'`,
    )
    // não deve aumentar o count (trigger não deve disparar para update sem mudança de merged_into/deleted_at)
    expect(depois.rows[0]?.n).toBe(antes.rows[0]?.n)
    await db.close()
  })
})
