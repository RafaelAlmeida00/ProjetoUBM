// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole } from './_pglite/harness'

// Onda 1 / T-O1.7 — backfill proposal → dor (não destrutivo; idempotente).
// RN6, RN20 (herança) · spec §9.
const A = '00000000-0000-0000-0000-0000000000aa'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedProposals(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id,email) values ('${A}','a@empresa.com'),('${ADM}','adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
  `)
  // Cria 3 proposals com empresa_id já fixado (simulando estado pós-backfill da 0014)
  // A 0014 já adicionou empresa_id à proposal; aqui semeamos com empresa canônica
  const empId = (await db.query<{ id: string }>(
    `insert into public.empresa(nome_canonico, created_by) values ('Nissan','${A}') returning id`
  )).rows[0]!.id
  for (let i = 1; i <= 3; i++) {
    await db.exec(
      `insert into public.proposal(user_id,email,rep_nome,empresa,dor,cursos,consent,consent_version,consent_at,empresa_id)
       values ('${A}','a@empresa.com','Rep A','Nissan','dor numero ${i}','{engenharia_de_software,direito}'::curso_ubm[],true,'v1',now(),'${empId}')`
    )
  }
  // 1 proposal SEM empresa_id (deve ser ignorada no backfill)
  await db.exec(
    `insert into public.proposal(user_id,email,rep_nome,empresa,dor,cursos,consent,consent_version,consent_at)
     values ('${A}','a@empresa.com','Rep A','Empresa Desconhecida','dor sem empresa','{}',true,'v1',now())`
  )
}

describe('0021 backfill proposal → dor', () => {
  it('função backfill_proposal_para_dor existe', async () => {
    const db = await novoBanco()
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from information_schema.routines
       where routine_schema='public' and routine_name='backfill_proposal_para_dor'`
    )).rows[0]!.n
    expect(n).toBe(1)
    await db.close()
  })

  it('paridade de contagem: proposals com empresa_id → dores criadas (CA13 análogo)', async () => {
    const db = await novoBanco(); await seedProposals(db)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.backfill_proposal_para_dor()`)
    await db.exec('reset role')
    // 3 proposals com empresa_id → 3 dores criadas
    const nDores = (await db.query<{ n: number }>(`select count(*)::int n from public.dor`)).rows[0]!.n
    expect(nDores).toBe(3)
    // 1 sem empresa_id → não migrada
    const semEmpresa = (await db.query<{ n: number }>(
      `select count(*)::int n from public.proposal where empresa_id is null`
    )).rows[0]!.n
    expect(semEmpresa).toBe(1)
    await db.close()
  })

  it('consentimento preservado na migração (RN20)', async () => {
    const db = await novoBanco(); await seedProposals(db)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.backfill_proposal_para_dor()`)
    await db.exec('reset role')
    const dores = (await db.query<{ consentimento: boolean; consent_version: string }>(
      `select consentimento, consent_version from public.dor`
    )).rows
    for (const d of dores) {
      expect(d.consentimento).toBe(true)
      expect(d.consent_version).toBe('v1')
    }
    await db.close()
  })

  it('empresa canônica preservada (RN6)', async () => {
    const db = await novoBanco(); await seedProposals(db)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.backfill_proposal_para_dor()`)
    await db.exec('reset role')
    const semEmpresa = (await db.query<{ n: number }>(
      `select count(*)::int n from public.dor where empresa_id is null`
    )).rows[0]!.n
    expect(semEmpresa).toBe(0) // todas as dores migradas têm empresa canônica
    await db.close()
  })

  it('cursos migrados para dor_curso (RN8)', async () => {
    const db = await novoBanco(); await seedProposals(db)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.backfill_proposal_para_dor()`)
    await db.exec('reset role')
    // Cada das 3 proposals tinha 2 cursos → 6 registros em dor_curso
    const nCursos = (await db.query<{ n: number }>(`select count(*)::int n from public.dor_curso`)).rows[0]!.n
    expect(nCursos).toBe(6)
    await db.close()
  })

  it('re-rodar o backfill NÃO duplica dores (idempotente)', async () => {
    const db = await novoBanco(); await seedProposals(db)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.backfill_proposal_para_dor()`)
    await db.query(`select public.backfill_proposal_para_dor()`) // segunda vez
    await db.exec('reset role')
    const nDores = (await db.query<{ n: number }>(`select count(*)::int n from public.dor`)).rows[0]!.n
    expect(nDores).toBe(3) // ainda 3, não 6
    await db.close()
  })

  it('proposal NÃO é dropada pelo backfill (não destrutivo — 0022 é blocked)', async () => {
    const db = await novoBanco(); await seedProposals(db)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.backfill_proposal_para_dor()`)
    await db.exec('reset role')
    // proposal ainda existe
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.proposal`)).rows[0]!.n
    expect(n).toBe(4) // 3 com empresa + 1 sem (todas preservadas)
    await db.close()
  })

  it('não-admin não pode executar o backfill (gate is_admin)', async () => {
    const db = await novoBanco(); await seedProposals(db)
    const { negado } = await import('./_pglite/harness')
    await comoUsuario(db, { uid: A })
    expect(await negado(db.query(`select public.backfill_proposal_para_dor()`))).toBe(true)
    await db.close()
  })
})
