// @vitest-environment node
// T-AN6 RED — 0040 retenção: expurgar_dores_orfas_expiradas() DEFINER admin-only (≤90d)
// Rastreab.: SR-A10 (LGPD art. 6/16/18) · STRIDE R-A01
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const REP = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}', 'rep@empresa.com'),
      ('${ADM}', 'adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by)
      values ('Acme Corp', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

describe('0040 retenção — expurgar_dores_orfas_expiradas()', () => {
  it('função expurgar_dores_orfas_expiradas existe', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ proname: string }>(
      `select proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'expurgar_dores_orfas_expiradas'`
    )).rows
    expect(rows.length, 'função expurgar_dores_orfas_expiradas deve existir').toBe(1)
    await db.close()
  })

  it('não-admin → negado ao chamar expurgar_dores_orfas_expiradas()', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(`select public.expurgar_dores_orfas_expiradas()`)
    )
    expect(err, 'não-admin deve ser negado').toBe(true)
    await db.close()
  })

  it('anon → negado ao chamar expurgar_dores_orfas_expiradas()', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoAnon(db)
    const err = await negado(
      db.query(`select public.expurgar_dores_orfas_expiradas()`)
    )
    expect(err, 'anon deve ser negado').toBe(true)
    await db.close()
  })

  it('órfã com created_at < hoje-90d é expurgada pelo admin', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    // Insere órfã "velha" com created_at no passado (91 dias atrás)
    await comoServiceRole(db)
    const antiga = (await db.query<{ id: string }>(
      `insert into public.dor
         (autor_id, empresa_id, status_dor, descricao, rep_nome,
          consentimento, consent_version, consent_at, claim_email, created_at)
       values
         (null, $1, 'em_moderacao', 'dor velha', 'Rep',
          true, 'v1', now(), 'old@corp.com', now() - interval '91 days')
       returning id`,
      [eid]
    )).rows[0]!

    // Admin expurga
    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    await db.query(`select public.expurgar_dores_orfas_expiradas()`)

    // Verifica que a dor velha foi expurgada (deleted_at setado ou dados anonimizados)
    await comoServiceRole(db)
    const dor = (await db.query<{ deleted_at: string | null; claim_email: string | null }>(
      `select deleted_at, claim_email from public.dor where id = $1`, [antiga.id]
    )).rows[0]!
    // A dor deve ter sido soft-deletada ou anonimizada
    expect(
      dor.deleted_at !== null || dor.claim_email === null || dor.claim_email === '',
      'dor velha deve estar expurgada (deleted ou anonimizada)'
    ).toBe(true)
    await db.close()
  })

  it('órfã recente (< 90d) é preservada pelo expurgo', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    // Insere órfã recente
    await comoServiceRole(db)
    const recente = (await db.query<{ id: string }>(
      `insert into public.dor
         (autor_id, empresa_id, status_dor, descricao, rep_nome,
          consentimento, consent_version, consent_at, claim_email)
       values
         (null, $1, 'em_moderacao', 'dor recente', 'Rep',
          true, 'v1', now(), 'new@corp.com')
       returning id`,
      [eid]
    )).rows[0]!

    // Admin expurga
    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    await db.query(`select public.expurgar_dores_orfas_expiradas()`)

    // Verifica que a dor recente NÃO foi expurgada
    await comoServiceRole(db)
    const dor = (await db.query<{ deleted_at: string | null }>(
      `select deleted_at from public.dor where id = $1`, [recente.id]
    )).rows[0]!
    expect(dor.deleted_at, 'dor recente deve ser preservada').toBeNull()
    await db.close()
  })

  it('órfã reclamada (com autor) não é expurgada', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    // Insere dor COM autor (reclamada) mas "velha"
    await comoServiceRole(db)
    const reclamada = (await db.query<{ id: string }>(
      `insert into public.dor
         (autor_id, empresa_id, status_dor, descricao, rep_nome,
          consentimento, consent_version, consent_at, created_at)
       values
         ($1, $2, 'em_moderacao', 'dor reclamada velha', 'Rep',
          true, 'v1', now(), now() - interval '91 days')
       returning id`,
      [REP, eid]
    )).rows[0]!

    // Admin expurga
    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    await db.query(`select public.expurgar_dores_orfas_expiradas()`)

    // Verifica que a dor reclamada NÃO foi expurgada
    await comoServiceRole(db)
    const dor = (await db.query<{ deleted_at: string | null }>(
      `select deleted_at from public.dor where id = $1`, [reclamada.id]
    )).rows[0]!
    expect(dor.deleted_at, 'dor reclamada não deve ser expurgada').toBeNull()
    await db.close()
  })
})
