// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario } from './_pglite/harness'

// Onda 5 / CA13/CA14/A6/A7 — backfill: agrupa por normalizado; fixa só após revisão; texto preservado.
const A = '00000000-0000-0000-0000-0000000000aa'

async function seedProposals(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`insert into auth.users(id,email) values ('${A}','a@empresa.com')`)
  await db.exec(`insert into public.admin_app(user_id) values ('${A}')`)
  for (const nome of ['Nissan', 'NISSAN', 'Nissan Ltda']) {
    await db.exec(
      `insert into public.proposal(user_id,email,rep_nome,empresa,dor,cursos,consent,consent_version,consent_at)
       values ('${A}','a@empresa.com','Rep','${nome}','dor','{engenharia_de_software}'::curso_ubm[],true,'v1',now())`,
    )
  }
}

describe('0014 backfill do legado', () => {
  it('agrupa nomes legados em UMA empresa (CA13) e só fixa após revisão (CA14/A7)', async () => {
    const db = await novoBanco()
    await seedProposals(db)
    await comoUsuario(db, { uid: A })

    const grupos = await db.query<{ qtd: number; empresa_id: string }>(
      `select qtd, empresa_id from public.propor_backfill_empresas()`,
    )
    expect(grupos.rows.length).toBe(1) // 'Nissan'/'NISSAN'/'Nissan Ltda' → 1 grupo
    expect(Number(grupos.rows[0]!.qtd)).toBe(3)
    const empId = grupos.rows[0]!.empresa_id

    // antes de aplicar: vínculos NÃO fixados e texto legado intacto (A7)
    await db.exec('reset role')
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.proposal where empresa_id is null`)).rows[0]?.n).toBe(3)

    // aplica o grupo (admin) → fixa empresa_id; texto preservado (CA14)
    await comoUsuario(db, { uid: A })
    const fixados = (await db.query<{ aplicar_backfill_grupo: number }>(`select public.aplicar_backfill_grupo('${empId}')`)).rows[0]!.aplicar_backfill_grupo
    expect(Number(fixados)).toBe(3)
    await db.exec('reset role')
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.proposal where empresa_id='${empId}'`)).rows[0]?.n).toBe(3)
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.proposal where empresa='Nissan Ltda'`)).rows[0]?.n).toBe(1) // texto original preservado
    await db.close()
  })
})
