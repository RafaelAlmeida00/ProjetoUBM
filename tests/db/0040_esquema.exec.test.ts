// @vitest-environment node
// T-AN1 RED — 0040 esquema: autor_id nullable + claim_email + índice parcial + constraints da órfã
// Rastreab.: CA21 · RN4, RN16 · SR-A1, SR-A6, SR-A8 · ADR-004E (E.1)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoServiceRole, negado } from './_pglite/harness'

const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values ('${ADM}', 'adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by)
      values ('Acme Corp', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

describe('0040 esquema — autor_id nullable na tabela dor', () => {
  it('autor_id aceita NULL (coluna nullable após 0040)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoServiceRole(db)
    // INSERT direto contornando RLS — precisa do service_role pois dor_insert_autor exige verificado
    const rows = (await db.query<{ id: string }>(
      `insert into public.dor
         (autor_id, empresa_id, status_dor, descricao, rep_nome,
          consentimento, consent_version, consent_at, claim_email)
       values
         (null, $1, 'em_moderacao', 'dor orfã TEST', 'Rep Anon',
          true, 'v1', now(), 'anon@corp.com')
       returning id`,
      [eid]
    )).rows
    expect(rows.length, 'deve inserir dor órfã com autor_id null').toBe(1)
    expect(rows[0]!.id).toBeTruthy()
    await db.close()
  })
})

describe('0040 esquema — constraint dor_orfa_ou_autor (órfã só em moderação)', () => {
  it('órfã com status=rascunho é negada pela constraint', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoServiceRole(db)
    const err = await negado(
      db.query(
        `insert into public.dor
           (autor_id, empresa_id, status_dor, descricao, rep_nome,
            consentimento, consent_version, consent_at, claim_email)
         values
           (null, $1, 'rascunho', 'dor sem autor', 'Rep',
            true, 'v1', now(), 'x@corp.com')`,
        [eid]
      )
    )
    expect(err, 'rascunho sem autor deve ser negado (constraint)').toBe(true)
    await db.close()
  })

  it('órfã com status=publicada é negada pela constraint', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoServiceRole(db)
    const err = await negado(
      db.query(
        `insert into public.dor
           (autor_id, empresa_id, status_dor, descricao, rep_nome,
            consentimento, consent_version, consent_at, claim_email,
            aprovado_por, aprovado_em, publicada_em)
         values
           (null, $1, 'publicada', 'dor sem autor pub', 'Rep',
            true, 'v1', now(), 'x@corp.com',
            $2, now(), now())`,
        [eid, ADM]
      )
    )
    expect(err, 'publicada sem autor deve ser negada (constraint)').toBe(true)
    await db.close()
  })

  it('órfã com status=rejeitada é negada pela constraint', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoServiceRole(db)
    const err = await negado(
      db.query(
        `insert into public.dor
           (autor_id, empresa_id, status_dor, descricao, rep_nome,
            consentimento, consent_version, consent_at, claim_email,
            motivo_rejeicao)
         values
           (null, $1, 'rejeitada', 'dor sem autor rej', 'Rep',
            true, 'v1', now(), 'x@corp.com', 'motivo')`,
        [eid]
      )
    )
    expect(err, 'rejeitada sem autor deve ser negada (constraint)').toBe(true)
    await db.close()
  })

  it('órfã com status=em_moderacao é aceita pela constraint', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoServiceRole(db)
    const rows = (await db.query<{ id: string }>(
      `insert into public.dor
         (autor_id, empresa_id, status_dor, descricao, rep_nome,
          consentimento, consent_version, consent_at, claim_email)
       values
         (null, $1, 'em_moderacao', 'dor orfã moderacao', 'Rep Anon',
          true, 'v1', now(), 'anon@corp.com')
       returning id`,
      [eid]
    )).rows
    expect(rows.length, 'em_moderacao sem autor deve ser aceita').toBe(1)
    await db.close()
  })
})

describe('0040 esquema — constraint publicada exige autor_id (reforço)', () => {
  it('publicada sem autor_id é negada mesmo com aprovado_por e publicada_em', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoServiceRole(db)
    const err = await negado(
      db.query(
        `insert into public.dor
           (autor_id, empresa_id, status_dor, descricao, rep_nome,
            consentimento, consent_version, consent_at, claim_email,
            aprovado_por, aprovado_em, publicada_em)
         values
           (null, $1, 'publicada', 'tentativa publicar sem autor', 'Rep',
            true, 'v1', now(), 'anon@corp.com',
            $2, now(), now())`,
        [eid, ADM]
      )
    )
    expect(err, 'publicada sem autor_id deve ser negada').toBe(true)
    await db.close()
  })
})

describe('0040 esquema — campo claim_email existe e é normalizado', () => {
  it('claim_email é persistido via INSERT service_role', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoServiceRole(db)
    const rows = (await db.query<{ claim_email: string }>(
      `insert into public.dor
         (autor_id, empresa_id, status_dor, descricao, rep_nome,
          consentimento, consent_version, consent_at, claim_email)
       values
         (null, $1, 'em_moderacao', 'dor com email', 'Rep',
          true, 'v1', now(), '  ANON@Corp.com  ')
       returning claim_email`,
      [eid]
    )).rows
    // O valor bruto é gravado; a normalização lower/btrim é responsabilidade da RPC (T-AN2)
    expect(rows[0]!.claim_email).toBeTruthy()
    await db.close()
  })
})

describe('0040 esquema — índice parcial em claim_email para órfãs', () => {
  it('índice parcial em (lower(claim_email)) where autor_id is null existe em pg_indexes', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where tablename = 'dor'
          and schemaname = 'public'
          and indexname = 'dor_claim_email_orfa_idx'`
    )).rows
    expect(rows.length, 'índice parcial dor_claim_email_orfa_idx deve existir').toBe(1)
    await db.close()
  })
})
