// @vitest-environment node
// T-AN8 [SEG-DURO] RED — Claim com token errado = negado (anti-spoofing SR-B4/SR-B5)
// Rastreab.: CA22 · RN25 · SR-B4, SR-B5, SR-A8 [DURO] · STRIDE S-A01/E-A02
// NUNCA enfraquecer este teste (protect-tests)
// Transformado da versão 0040 (e-mail) para 0042 (token one-shot) — ADR-004F
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const REP = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'
const OUT = '00000000-0000-0000-0000-0000000000dd'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}', 'rep@empresa.com'),
      ('${ADM}', 'adm@empresa.com'),
      ('${OUT}', 'outro@corp.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by)
      values ('Acme Corp', '${ADM}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

async function criarOrfaComToken(db: import('@electric-sql/pglite').PGlite, email = 'rep@empresa.com'): Promise<{ dorId: string; token: string }> {
  const eid = await empId(db)
  await comoAnon(db)
  const r = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
    `select * from public.submeter_dor_landing(
       $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
     )`,
    [eid, 'dor orfã mismatch test', 'Rep Anon', 'TI', 'Dev', true, 'v1', new Date().toISOString(), email]
  )).rows
  return { dorId: r[0]!.out_dor_id, token: r[0]!.out_claim_token }
}

describe('[SEG-DURO] Claim com token errado = negado (anti-spoofing SR-B4)', () => {
  it('token errado → raise (negado)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token: _ } = await criarOrfaComToken(db, 'rep@empresa.com')

    // OUT tenta reclamar com token falso
    await comoUsuario(db, { uid: OUT, email: 'outro@corp.com' })
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2)`, [dorId, '00000000000000000000000000000000'])
    )
    expect(err, '[SEG-DURO] claim com token errado deve ser negado').toBe(true)
    await db.close()
  })

  it('após tentativa com token errado, dor permanece órfã (autor_id ainda null)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token: _ } = await criarOrfaComToken(db, 'rep@empresa.com')

    // Tentativa com token falso
    await comoUsuario(db, { uid: OUT, email: 'outro@corp.com' })
    await negado(db.query(`select public.reclamar_dor($1, $2)`, [dorId, '00000000000000000000000000000000']))

    // Verifica que a dor continua órfã
    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string | null }>(
      `select autor_id from public.dor where id = $1`, [dorId]
    )).rows[0]!
    expect(dor.autor_id, '[SEG-DURO] autor_id deve continuar null após token errado').toBeNull()
    await db.close()
  })

  it('dor_id + token errado → negado (anti-enumeração SR-B5)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token: _ } = await criarOrfaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: OUT, email: 'outro@corp.com' })
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2)`, [dorId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'])
    )
    expect(err, 'dor_id correto + token errado deve falhar').toBe(true)
    await db.close()
  })
})

// T-B01 [SEG-DURO] — claim sem token (vazio/null) = negado (SR-B4 / STRIDE T-B01)
// Guarda 0042:243 — `if p_token is null or length(btrim(p_token)) = 0 then raise`
describe('[SEG-DURO] Claim sem token (vazio ou null) = negado (T-B01)', () => {
  it('reclamar_dor com token vazio ("") → negado antes de qualquer escrita', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId } = await criarOrfaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: OUT, email: 'outro@corp.com' })
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2)`, [dorId, ''])
    )
    expect(err, '[T-B01] token vazio deve ser negado').toBe(true)
    await db.close()
  })

  it('após tentativa com token vazio, dor permanece órfã (autor_id null)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId } = await criarOrfaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: OUT, email: 'outro@corp.com' })
    await negado(db.query(`select public.reclamar_dor($1, $2)`, [dorId, '']))

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string | null }>(
      `select autor_id from public.dor where id = $1`, [dorId]
    )).rows[0]!
    expect(dor.autor_id, '[T-B01] autor_id deve continuar null após token vazio').toBeNull()
    await db.close()
  })
})
