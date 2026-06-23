// @vitest-environment node
/**
 * T05 — BARREIRA DURA CA2: security_invoker em toda vw_* da 008 (par A≠B)
 *
 * VT-02: par A≠B — A abre vw_meu_resumo → NENHUMA linha de B aparece.
 * VT-07: inspeção pg_class.reloptions — toda vw_* da 008 contém security_invoker=true.
 *
 * spec: CA2 (DURO) · RN4 · RS-A1 · I2 · veto-seg #2
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario } from './_pglite/harness'
import { seedAnalytics, IDS } from './_pglite/seed-analytics'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
})
afterEach(async () => { await db.close() })

// Views da 008-analytics Velocidade A (Onda A)
const VIEWS_008 = ['vw_meu_resumo', 'vw_painel_empresa']

describe('0079 barreira CA2 — security_invoker em toda vw_* (T05)', () => {

  // ── VT-07: inspeção estrutural de pg_class.reloptions ────────────────────
  it('VT-07: toda vw_* da 008 tem security_invoker=true em reloptions', async () => {
    for (const view of VIEWS_008) {
      const r = await db.query<{ reloptions: string[] | null }>(
        `select reloptions
         from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = $1
           and c.relkind = 'v'`,
        [view]
      )
      expect(r.rows).toHaveLength(1)

      const opts = r.rows[0]!.reloptions ?? []
      const hasInvoker = opts.some(
        (o) => o === 'security_invoker=true' || o === 'security_invoker=on'
      )
      expect(
        hasInvoker,
        `view "${view}" não tem security_invoker=true em reloptions (veto #2 / CA2)`
      ).toBe(true)
    }
  })

  // ── VT-02: par A≠B — A não vê linha de B em vw_meu_resumo ───────────────
  it('VT-02: usuário A abre vw_meu_resumo e não vê dados de B', async () => {
    // Adiciona B como membro do projeto em execução (RLS de funcao_tarefa exige is_team_member)
    // e cria 1 tarefa aberta para B, para distinguir dos 0 que B teria sem memberships
    await db.exec(`
      insert into public.membro_equipe (projeto_id, pessoa_id, papel_projeto)
      values ('${IDS.projetoEmExecucao}', '${IDS.userB}', 'aluno')
      on conflict do nothing;

      insert into public.funcao_tarefa (projeto_id, responsavel_id, titulo, concluida)
      values ('${IDS.projetoEmExecucao}', '${IDS.userB}', 'Tarefa de B', false);
    `)

    // Sessão de A: vê só seus KPIs (2 tarefas abertas do seed)
    await comoUsuario(db, { uid: IDS.userA })
    const rA = await db.query<{ tarefas_abertas: string | number }>(
      `select tarefas_abertas from public.vw_meu_resumo`
    )

    // Sessão de B: vê só seus KPIs (1 tarefa aberta que acabamos de criar)
    await comoUsuario(db, { uid: IDS.userB })
    const rB = await db.query<{ tarefas_abertas: string | number }>(
      `select tarefas_abertas from public.vw_meu_resumo`
    )

    const tarefasA = parseInt(String(rA.rows[0]!.tarefas_abertas))
    const tarefasB = parseInt(String(rB.rows[0]!.tarefas_abertas))

    // A tem 2 tarefas abertas; B tem 1 → sessões isoladas por security_invoker
    expect(tarefasA).toBe(2)
    expect(tarefasB).toBe(1)
    // Se security_invoker estivesse ausente, ambos veriam o total global (3)
    expect(tarefasA).not.toBe(tarefasB)
  })

  it('VT-02: cada usuário vê somente seu próprio resumo (1 linha)', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    const rA = await db.query(`select * from public.vw_meu_resumo`)
    expect(rA.rows).toHaveLength(1)

    await comoUsuario(db, { uid: IDS.userB })
    const rB = await db.query(`select * from public.vw_meu_resumo`)
    expect(rB.rows).toHaveLength(1)
  })
})
