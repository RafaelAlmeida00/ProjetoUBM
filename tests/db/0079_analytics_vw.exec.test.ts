// @vitest-environment node
/**
 * T03 — 0079_vw_velocidade_a: views vw_meu_resumo e vw_painel_empresa
 *
 * RED: views não existem → queries falham.
 * GREEN: views criadas → VT-01/VT-03/VT-04 verdes.
 *
 * spec: CA1/CA3/CA4 · RN1/RN2/RN5 · RS-A1/A2
 *
 * VT-01 (F1 feliz): usuário A abre vw_meu_resumo e vê seu resumo refletindo o estado atual.
 * VT-03 (frescor por-linha): cria/finaliza algo → número muda na hora; sem coluna atualizado_em.
 * VT-04 (F2 feliz): rep de X vê agregados de X.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario, negado } from './_pglite/harness'
import { seedAnalytics, IDS } from './_pglite/seed-analytics'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await seedAnalytics(db)
})
afterEach(async () => { await db.close() })

// ── Tipo dos resultados ────────────────────────────────────────────────────
interface MeuResumo {
  dores_publicadas:         string | number
  projetos_em_execucao:     string | number
  projetos_finalizados:     string | number
  tarefas_abertas:          string | number
}

interface PainelEmpresa {
  empresa_id:          string
  dores_rascunho:      string | number
  dores_em_moderacao:  string | number
  dores_publicadas:    string | number
  dores_rejeitadas:    string | number
  projetos_derivados:  string | number
  projetos_finalizados:string | number
}

const toNum = (v: string | number | null | undefined): number =>
  typeof v === 'number' ? v : parseInt(String(v ?? '0'))

describe('0079 views Velocidade A — T03 (VT-01/VT-03/VT-04)', () => {

  // ── VT-01: F1 feliz — usuário A vê seu resumo ────────────────────────────
  it('VT-01: userA vê seu resumo pessoal correto', async () => {
    await comoUsuario(db, { uid: IDS.userA })
    const r = await db.query<MeuResumo>(`select * from public.vw_meu_resumo`)

    expect(r.rows).toHaveLength(1)
    const row = r.rows[0]!
    // userA tem 0 dores publicadas (as dores publicadas são de userRep)
    expect(toNum(row.dores_publicadas)).toBe(0)
    // userA é membro de projetoFinalizado (finalizado) e projetoEmExecucao (em_execucao)
    expect(toNum(row.projetos_em_execucao)).toBe(1)
    expect(toNum(row.projetos_finalizados)).toBe(1)
    // userA tem 2 tarefas abertas (seed: 1 em projetoFinalizado + 1 em projetoEmExecucao)
    expect(toNum(row.tarefas_abertas)).toBe(2)
  })

  // ── VT-03: frescor por-linha — números mudam na hora; sem atualizado_em ──
  it('VT-03: frescor — nova tarefa aparece na hora; sem coluna atualizado_em', async () => {
    // Confirma ausência de coluna de carimbo (CA3/RN5)
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'vw_meu_resumo'`
    )
    const nomes = cols.rows.map(r => r.column_name)
    expect(nomes).not.toContain('atualizado_em')
    expect(nomes).not.toContain('updated_at')

    // Antes: userA tem 2 tarefas abertas
    await comoUsuario(db, { uid: IDS.userA })
    const antes = await db.query<MeuResumo>(`select * from public.vw_meu_resumo`)
    const tarefasAntes = toNum(antes.rows[0]!.tarefas_abertas)

    // Insere nova tarefa aberta para userA (sem role set — usa service_role implícito do harness)
    await db.exec(`reset role`)
    await db.exec(`
      insert into public.funcao_tarefa (projeto_id, responsavel_id, titulo, concluida)
      values ('${IDS.projetoEmExecucao}', '${IDS.userA}', 'Nova tarefa frescor', false)
    `)

    // Depois: deve aparecer imediatamente (view, não MV)
    await comoUsuario(db, { uid: IDS.userA })
    const depois = await db.query<MeuResumo>(`select * from public.vw_meu_resumo`)
    expect(toNum(depois.rows[0]!.tarefas_abertas)).toBe(tarefasAntes + 1)
  })

  // ── VT-04: F2 feliz — rep de X vê agregados de X ─────────────────────────
  it('VT-04: rep de X vê painel da empresa X', async () => {
    await comoUsuario(db, { uid: IDS.userRep })
    const r = await db.query<PainelEmpresa>(`select * from public.vw_painel_empresa`)

    // Rep X vê apenas empresa X (não Y)
    const empresas = r.rows.map(row => row.empresa_id)
    expect(empresas).toContain(IDS.empresaX)
    expect(empresas).not.toContain(IDS.empresaY)

    const rowX = r.rows.find(row => row.empresa_id === IDS.empresaX)!
    expect(rowX).toBeDefined()

    // Empresa X tem: 1 dor publicada, 1 rascunho, 1 em_moderacao
    expect(toNum(rowX.dores_publicadas)).toBeGreaterThanOrEqual(1)
    expect(toNum(rowX.dores_rascunho)).toBeGreaterThanOrEqual(1)
  })
})
