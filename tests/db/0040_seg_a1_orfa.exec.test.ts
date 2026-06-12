// @vitest-environment node
// T-AN10 [SEG-DURO] RED — A1: aprovar órfã NÃO publica até claim+verificação (ADR-004B intocado)
// Rastreab.: CA22, CA10 · RN9, RN25 · SR-A1, SR-A6 · ADR-004B
// NUNCA enfraquecer este teste (protect-tests)
// Atualizado para 0042: claim via token, não e-mail.
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

async function criarOrfaComToken(db: import('@electric-sql/pglite').PGlite): Promise<{ dorId: string; token: string }> {
  const eid = await empId(db)
  await comoAnon(db)
  const r = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
    `select * from public.submeter_dor_landing(
       $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
     )`,
    [eid, 'dor orfã a1 test', 'Rep Anon', 'TI', 'Dev', true, 'v1', new Date().toISOString(), 'rep@empresa.com']
  )).rows
  return { dorId: r[0]!.out_dor_id, token: r[0]!.out_claim_token }
}

describe('[SEG-DURO] A1 — aprovar órfã não a publica (constraint exige autor_id)', () => {
  it('admin aprova (seta aprovado_por) → dor permanece em_moderacao, NÃO vai a publicada', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId } = await criarOrfaComToken(db)

    // Admin seta aprovado_por (simula moderação manual via moderar_dor, que chama RPC 0018)
    await comoServiceRole(db)
    const err = await negado(
      db.query(
        `update public.dor
           set status_dor = 'publicada',
               aprovado_por = $1,
               aprovado_em = now(),
               publicada_em = now()
         where id = $2`,
        [ADM, dorId]
      )
    )
    expect(err, '[SEG-DURO] forçar publicada em órfã deve ser negado pela constraint').toBe(true)
    await db.close()
  })

  it('após claim com token, dor permanece em_moderacao (claim não publica — A1 intocada)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaComToken(db)

    // Claim com token: vincula autor_id
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2)`, [dorId, token])

    // Verifica que a dor permanece em_moderacao após o claim
    await comoServiceRole(db)
    const dor = (await db.query<{ status_dor: string; autor_id: string }>(
      `select status_dor, autor_id from public.dor where id = $1`, [dorId]
    )).rows[0]!
    expect(dor.status_dor, 'após claim dor deve permanecer em_moderacao').toBe('em_moderacao')
    expect(dor.autor_id, 'autor_id deve estar vinculado após claim').toBe(REP)
    await db.close()
  })

  it('aprovação sem claim: admin seta aprovado_por mas publicar sem autor_id → impossível', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId } = await criarOrfaComToken(db)

    // Admin tenta setar aprovado_por em dor órfã (ok — registra intenção)
    await comoServiceRole(db)
    await db.query(
      `update public.dor set aprovado_por = $1, aprovado_em = now() where id = $2`,
      [ADM, dorId]
    )

    // Tenta publicar (deve falhar pela constraint dor_orfa_ou_autor)
    const err = await negado(
      db.query(
        `update public.dor
           set status_dor = 'publicada', publicada_em = now()
         where id = $1`,
        [dorId]
      )
    )
    expect(err, 'publicar dor sem autor_id deve ser impossível').toBe(true)
    await db.close()
  })
})
