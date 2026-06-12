// @vitest-environment node
// T-AN5-0041 RED — reclamar_dor com empresa diferida (p_empresa_id) — token one-shot (0042)
// Rastreab.: CA22, CA27, CA30 · RN25 · SR-A8, SR-A12, SR-A-H3 · ADR-004E/E.3/E.4, ADR-004F
// Transformado para 0042: reclamar_dor(uuid,text,uuid) — token+empresa_id, não mais email.
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

/** Cria dor ÓRFÃ SEM empresa_id (diferida) + retorna token. */
async function criarOrfaSemEmpresaComToken(
  db: import('@electric-sql/pglite').PGlite,
  email = 'rep@empresa.com',
): Promise<{ dorId: string; token: string }> {
  await comoAnon(db)
  const r = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
    `select * from public.submeter_dor_landing(
       null, $1, $2, $3, $4, true, 'v1', now(), null, $5, 'Acme Corp'
     )`,
    ['dor orfã empresa diferida', 'Rep Anon', 'TI', 'Dev', email],
  )).rows
  return { dorId: r[0]!.out_dor_id, token: r[0]!.out_claim_token }
}

/** Cria dor ÓRFÃ COM empresa_id já resolvida + retorna token. */
async function criarOrfaComEmpresaComToken(
  db: import('@electric-sql/pglite').PGlite,
  eid: string,
  email = 'rep@empresa.com',
): Promise<{ dorId: string; token: string }> {
  await comoAnon(db)
  const r = (await db.query<{ out_dor_id: string; out_claim_token: string }>(
    `select * from public.submeter_dor_landing(
       $1, $2, $3, $4, $5, $6, $7, $8, null, $9, null
     )`,
    [eid, 'dor orfã com empresa', 'Rep Anon', 'TI', 'Dev', true, 'v1', new Date().toISOString(), email],
  )).rows
  return { dorId: r[0]!.out_dor_id, token: r[0]!.out_claim_token }
}

// ── BLOCO 1 — Chamada com token + p_empresa_id funciona ──────────────────
describe('0041/0042 — reclamar_dor(uuid,text,uuid): token + empresa diferida', () => {
  it('chamar reclamar_dor com token+empresa → vincula autor_id + empresa_id', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const { dorId, token } = await criarOrfaComEmpresaComToken(db, eid, 'rep@empresa.com')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, eid])

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string; empresa_id: string }>(
      `select autor_id, empresa_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id, 'autor_id vinculado com token+empresa').toBe(REP)
    expect(dor.empresa_id, 'empresa_id preservada').toBe(eid)
    await db.close()
  })
})

// ── BLOCO 2 — Órfã SEM empresa + p_empresa_id válido ────────────────────
describe('0041 empresa diferida — claim com token + p_empresa_id vincula empresa', () => {
  it('órfã sem empresa_id + token+p_empresa_id → vincula empresa_id na dor', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const { dorId, token } = await criarOrfaSemEmpresaComToken(db, 'rep@empresa.com')

    await comoServiceRole(db)
    const antes = (await db.query<{ empresa_id: string | null }>(
      `select empresa_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(antes.empresa_id, 'antes do claim: empresa_id deve ser null').toBeNull()

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, eid])

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string; empresa_id: string; status_dor: string }>(
      `select autor_id, empresa_id, status_dor from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id, 'autor_id vinculado após claim com empresa').toBe(REP)
    expect(dor.empresa_id, 'empresa_id vinculada após claim').toBe(eid)
    expect(dor.status_dor, 'A1 intocada: permanece em_moderacao').toBe('em_moderacao')
    await db.close()
  })

  it('órfã sem empresa_id + token+p_empresa_id → cria papel representante + membro_empresa', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const { dorId, token } = await criarOrfaSemEmpresaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, eid])

    await comoServiceRole(db)
    const papel = (await db.query<{ role: string }>(
      `select role from public.papel_usuario where user_id = $1`, [REP],
    )).rows
    expect(papel.some(p => p.role === 'representante'), 'papel representante criado').toBe(true)

    const membro = (await db.query<{ empresa_id: string }>(
      `select empresa_id from public.membro_empresa where user_id = $1 and papel = 'representante'`, [REP],
    )).rows
    expect(membro.length, 'vínculo membro_empresa criado').toBeGreaterThan(0)
    await db.close()
  })

  it('órfã sem empresa_id + token+p_empresa_id=null → autor_id vinculado mas empresa_id permanece null', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaSemEmpresaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2, null)`, [dorId, token])

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string; empresa_id: string | null }>(
      `select autor_id, empresa_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id, 'autor_id vinculado mesmo sem empresa').toBe(REP)
    expect(dor.empresa_id, 'empresa_id permanece null quando p_empresa_id=null').toBeNull()

    const membro = (await db.query<{ n: number }>(
      `select count(*)::int n from public.membro_empresa where user_id = $1`, [REP],
    )).rows[0]!.n
    expect(membro, 'sem p_empresa_id: onboarding_representante não chamado').toBe(0)
    await db.close()
  })
})

// ── BLOCO 3 — Não sobrescreve empresa já existente ──────────────────────
describe('0041 empresa diferida — empresa já setada NÃO é sobrescrita', () => {
  it('dor com empresa_id já setada + token+empresa diferente → empresa original preservada', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    const outraEmpId = (await db.query<{ id: string }>(
      `select public.obter_ou_criar_empresa('Outra Corp') id`,
    )).rows[0]!.id

    const { dorId, token } = await criarOrfaComEmpresaComToken(db, eid, 'rep@empresa.com')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, outraEmpId])

    await comoServiceRole(db)
    const dor = (await db.query<{ empresa_id: string }>(
      `select empresa_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.empresa_id, 'empresa original (eid) deve ser preservada, não sobrescrita').toBe(eid)
    await db.close()
  })
})

// ── BLOCO 4 — p_empresa_id inexistente → raise ──────────────────────────
describe('0041 empresa diferida — p_empresa_id inexistente provoca raise (atomicidade)', () => {
  it('token+empresa_id inexistente → raise; dor permanece órfã', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const { dorId, token } = await criarOrfaSemEmpresaComToken(db, 'rep@empresa.com')
    const UUID_FANTASMA = '00000000-dead-beef-0000-000000000000'

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, UUID_FANTASMA]),
    )
    expect(err, 'p_empresa_id inexistente deve provocar raise').toBe(true)

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string | null; empresa_id: string | null }>(
      `select autor_id, empresa_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id, '[ATOMICIDADE] autor_id deve permanecer null após raise').toBeNull()
    expect(dor.empresa_id, '[ATOMICIDADE] empresa_id deve permanecer null após raise').toBeNull()
    await db.close()
  })
})

// ── BLOCO 5 [SEG-DURO] — token divergente → nenhuma escrita ─────────────────────
describe('[SEG-DURO] 0041/0042 — token errado + p_empresa_id: nenhuma escrita ocorre', () => {
  it('token errado + p_empresa_id válido → negado ANTES de qualquer escrita', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const { dorId } = await criarOrfaSemEmpresaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: OUT, email: 'outro@corp.com' })
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, '00000000000000000000000000000000', eid]),
    )
    expect(err, '[SEG-DURO] token errado deve ser negado').toBe(true)

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string | null; empresa_id: string | null }>(
      `select autor_id, empresa_id from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id, '[SEG-DURO] autor_id não deve ser setado com token errado').toBeNull()
    expect(dor.empresa_id, '[SEG-DURO] empresa_id não deve ser setado com token errado').toBeNull()
    await db.close()
  })

  it('[SEG-DURO] dor permanece completamente órfã após tentativa com token falso + empresa', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const { dorId } = await criarOrfaSemEmpresaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: OUT, email: 'outro@corp.com' })
    await negado(db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eid]))

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string | null; empresa_id: string | null; status_dor: string }>(
      `select autor_id, empresa_id, status_dor from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.autor_id).toBeNull()
    expect(dor.empresa_id).toBeNull()
    expect(dor.status_dor).toBe('em_moderacao')
    await db.close()
  })
})

// ── BLOCO 6 — anon não executa a nova assinatura ────────────────────────
describe('0041/0042 grants — anon NÃO executa reclamar_dor', () => {
  it('anon não tem execute em reclamar_dor(uuid, text, uuid)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.reclamar_dor(uuid, text, uuid)', 'execute') ok`,
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em reclamar_dor').toBe(false)
    await db.close()
  })

  it('anon não consegue chamar reclamar_dor com 3 args (negado em runtime)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const { dorId, token } = await criarOrfaSemEmpresaComToken(db, 'rep@empresa.com')

    await comoAnon(db)
    const err = await negado(
      db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, eid]),
    )
    expect(err, 'anon não deve conseguir chamar reclamar_dor').toBe(true)
    await db.close()
  })
})

// ── BLOCO 7 — Re-claim idempotente (one-shot token) ─────────────────────
// TRANSFORMAÇÃO (Art. II §3 / ADR-004F F.2 / SR-B6):
// Mesmo uid re-claimando = no-op silencioso (idempotência — SR-B6 + 0041:80-82).
// O one-shot (hash zerado) impede que um UID DIFERENTE use o mesmo token —
// isso é coberto em 0042_seg_token_oneshot (T-B9). Aqui provamos que:
//   (a) o no-op silencioso NÃO duplica papel/vínculo;
//   (b) uid B com o mesmo token (hash já null) → negado (ver T-B9).
describe('0041/0042 one-shot — re-claim pelo mesmo uid = no-op (SR-B6/idempotência)', () => {
  it('1º claim com token+empresa → ok; 2º claim mesmo uid+token → no-op (sem erro, sem duplicata)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const { dorId, token } = await criarOrfaSemEmpresaComToken(db, 'rep@empresa.com')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    // 1º claim — víncula
    await db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, eid])
    // 2º claim mesmo uid+token → no-op silencioso (idempotência SR-B6)
    await db.query(`select public.reclamar_dor($1, $2, $3)`, [dorId, token, eid])

    await comoServiceRole(db)
    const papeis = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id = $1 and role = 'representante'`, [REP],
    )).rows[0]!.n
    expect(papeis, 'no-op: papel não duplicado').toBe(1)

    // one-shot: hash zerado após 1º claim
    const dor = (await db.query<{ claim_token_hash: Buffer | null }>(
      `select claim_token_hash from public.dor where id = $1`, [dorId],
    )).rows[0]!
    expect(dor.claim_token_hash, 'one-shot: claim_token_hash zerado após 1º claim').toBeNull()
    await db.close()
  })
})
