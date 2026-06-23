// @vitest-environment node
/**
 * T02 — smoke: seed-analytics sobe sem erro e devolve os ids esperados.
 *
 * RED: arquivo seed não existe / falha ao inserir → teste falha.
 * GREEN: seed roda sem erro; ids retornados batem com IDS esperados.
 *
 * spec 008: suporte a CA1–CA26 (fixture reutilizável).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco } from './harness'
import { seedAnalytics, IDS } from './seed-analytics'
import type { PGlite } from '@electric-sql/pglite'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
})
afterEach(async () => { await db.close() })

describe('seed-analytics smoke', () => {
  it('seed sobe sem erro e retorna ids', async () => {
    const result = await seedAnalytics(db)
    expect(result.ids).toBeDefined()
    expect(result.ids.userA).toBe(IDS.userA)
    expect(result.ids.empresaX).toBe(IDS.empresaX)
    expect(result.ids.cursoC1).toBe(IDS.cursoC1)
  })

  it('usuários A e B existem em auth.users', async () => {
    await seedAnalytics(db)
    const r = await db.query<{ count: string }>(
      `select count(*)::text as count from auth.users
       where id in ('${IDS.userA}', '${IDS.userB}')`
    )
    expect(r.rows[0]!.count).toBe('2')
  })

  it('empresas X e Y existem', async () => {
    await seedAnalytics(db)
    const r = await db.query<{ count: string }>(
      `select count(*)::text as count from public.empresa
       where id in ('${IDS.empresaX}', '${IDS.empresaY}')`
    )
    expect(r.rows[0]!.count).toBe('2')
  })

  it('projeto finalizado existe e não está soft-deletado', async () => {
    await seedAnalytics(db)
    const r = await db.query<{ status: string; deleted_at: string | null }>(
      `select status, deleted_at from public.projeto where id = '${IDS.projetoFinalizado}'`
    )
    expect(r.rows[0]!.status).toBe('finalizado')
    expect(r.rows[0]!.deleted_at).toBeNull()
  })

  it('projeto soft-deletado tem deleted_at preenchido', async () => {
    await seedAnalytics(db)
    const r = await db.query<{ deleted_at: string | null }>(
      `select deleted_at from public.projeto where id = '${IDS.projetoSoftDeletado}'`
    )
    expect(r.rows[0]!.deleted_at).not.toBeNull()
  })

  it('grupo grande tem >= 5 alunos', async () => {
    await seedAnalytics(db)
    const r = await db.query<{ count: string }>(
      `select count(*)::text as count from public.membro_equipe
       where projeto_id = '${IDS.projetoGrupoGrande}'
         and papel_projeto = 'aluno'
         and deleted_at is null`
    )
    expect(parseInt(r.rows[0]!.count)).toBeGreaterThanOrEqual(5)
  })

  it('grupo pequeno tem < 5 alunos', async () => {
    await seedAnalytics(db)
    const r = await db.query<{ count: string }>(
      `select count(*)::text as count from public.membro_equipe
       where projeto_id = '${IDS.projetoGrupoPequeno}'
         and papel_projeto = 'aluno'
         and deleted_at is null`
    )
    expect(parseInt(r.rows[0]!.count)).toBeLessThan(5)
  })

  it('userA tem ranking_optin=true e userB ranking_optin=false', async () => {
    await seedAnalytics(db)
    // PGlite devolve boolean como boolean nativo
    const a = await db.query<{ optin: boolean }>(
      `select ranking_optin as optin from public.perfil where user_id = '${IDS.userA}'`
    )
    const b = await db.query<{ optin: boolean }>(
      `select ranking_optin as optin from public.perfil where user_id = '${IDS.userB}'`
    )
    // Normaliza para boolean primitivo (PGlite pode devolver boolean ou 't'/'f')
    expect(Boolean(a.rows[0]!.optin)).toBe(true)
    expect(Boolean(b.rows[0]!.optin)).toBe(false)
  })

  it('userA tem 2 tarefas abertas (em projetos ativos) e 1 concluída', async () => {
    await seedAnalytics(db)
    const abertas = await db.query<{ count: string }>(
      `select count(*)::text as count from public.funcao_tarefa
       where responsavel_id = '${IDS.userA}' and concluida = false and deleted_at is null`
    )
    const concluidas = await db.query<{ count: string }>(
      `select count(*)::text as count from public.funcao_tarefa
       where responsavel_id = '${IDS.userA}' and concluida = true and deleted_at is null`
    )
    expect(parseInt(abertas.rows[0]!.count)).toBe(2)
    expect(parseInt(concluidas.rows[0]!.count)).toBe(1)
  })

  it('coordenador está associado a cursoC1 e cursoC2', async () => {
    await seedAnalytics(db)
    const r = await db.query<{ count: string }>(
      `select count(*)::text as count from public.coordenador_curso
       where user_id = '${IDS.userCoord}'
         and curso_id in ('${IDS.cursoC1}', '${IDS.cursoC2}')`
    )
    expect(r.rows[0]!.count).toBe('2')
  })
})
