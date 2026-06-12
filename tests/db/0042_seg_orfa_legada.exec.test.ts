// @vitest-environment node
// T-B11 [SEG-DURO] RED — Órfã legada sem token (claim_token_hash is null) = fail-closed (F.7 / SR-B4)
// Rastreab.: CA22 · RN17, RN25 · SR-B4 [DURO], SR-B10, SR-A6 · F.7 (degradação graciosa)
// NUNCA enfraquecer este teste (protect-tests)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const REP = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}', 'rep@gmail.com'),
      ('${ADM}', 'adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Acme Corp', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

/** Insere uma órfã legada (sem claim_token_hash — como criadas pela 0040/0041) via service role. */
async function criarOrfaLegada(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  const eid = await empId(db)
  await comoServiceRole(db)
  const r = (await db.query<{ id: string }>(
    `insert into public.dor (
       autor_id, empresa_id, status_dor, descricao,
       rep_nome, departamento, cargo,
       consentimento, consent_version, consent_at,
       claim_email, claim_token_hash
     ) values (
       null, $1, 'em_moderacao', 'dor legada sem token',
       'Rep Legado', 'TI', 'Dev',
       true, 'v1', now(),
       'legado@empresa.com', null
     ) returning id`,
    [eid],
  )).rows
  return r[0]!.id
}

describe('[SEG-DURO] Órfã legada (claim_token_hash is null) = fail-closed (F.7/SR-B4)', () => {
  it('reclamar_dor com qualquer token sobre órfã legada → negado (null hash = fail-closed)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarOrfaLegada(db)

    await comoUsuario(db, { uid: REP, email: 'rep@gmail.com' })
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2)`, [dorId, 'qualquer-token-de-128-bits-aqui']),
    )
    expect(err, '[SEG-DURO] órfã legada sem token deve ser fail-closed').toBe(true)
    await db.close()
  })

  it('após tentativa com token na órfã legada, autor_id permanece null', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarOrfaLegada(db)

    await comoUsuario(db, { uid: REP, email: 'rep@gmail.com' })
    await negado(
      db.query(`select public.reclamar_dor($1, $2)`, [dorId, 'aa'.repeat(32)]),
    )

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string | null }>(
      `select autor_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id, '[SEG-DURO] autor_id deve continuar null na órfã legada').toBeNull()
    await db.close()
  })

  it('anon não vê a órfã legada — admin-only (SR-A6/SR-B10)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarOrfaLegada(db)

    // anon: 0 linhas (RLS bloqueia)
    await comoAnon(db)
    const rows = (await db.query<{ id: string }>(
      `select id from public.dor where id = $1`, [dorId],
    )).rows
    expect(rows.length, 'anon não deve ver órfã legada (SR-A6)').toBe(0)
    await db.close()
  })

  it('usuário não-admin não vê a órfã legada — admin-only (SR-A6/SR-B10)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarOrfaLegada(db)

    await comoUsuario(db, { uid: REP, email: 'rep@gmail.com' })
    const rows = (await db.query<{ id: string }>(
      `select id from public.dor where id = $1`, [dorId],
    )).rows
    expect(rows.length, 'não-admin não deve ver órfã legada (SR-A6)').toBe(0)
    await db.close()
  })

  it('admin vê a órfã legada na fila (reconciliação admin)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarOrfaLegada(db)

    // Service role (equivalente a admin interno) enxerga a órfã
    await comoServiceRole(db)
    const rows = (await db.query<{ id: string; autor_id: string | null }>(
      `select id, autor_id from public.dor where id = $1`, [dorId],
    )).rows
    expect(rows.length, 'service role deve ver a órfã para reconciliação').toBe(1)
    expect(rows[0]!.autor_id, 'autor_id ainda null — aguarda reconciliação admin').toBeNull()
    await db.close()
  })
})
