// @vitest-environment node
/**
 * C3 — admin/dores RSC: valida que os nomes de coluna consultados existem no schema real.
 * Bug C3: o RSC usava 'status' (deve ser 'status_dor'), 'criada_em' (deve ser 'created_at')
 *         e 'perfil.id' (deve ser 'user_id') — migração 0015 / 0003.
 * Sem a correção: .eq('status','em_moderacao') retorna 0 rows no real → fila sempre vazia.
 *
 * Estratégia: consultas diretas ao information_schema + queries funcionais contra PGlite
 * para travar os nomes de coluna corretos.
 */
import { describe, it, expect } from 'vitest'
import { novoBanco } from './_pglite/harness'

describe('C3 — schema dor: colunas corretas (status_dor, created_at)', () => {
  it('C3-RED: tabela dor tem coluna status_dor (não "status")', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'dor'
        ORDER BY ordinal_position`,
    )).rows.map((r) => r.column_name)

    // A coluna correta deve existir
    expect(rows).toContain('status_dor')
    // A coluna errada NÃO deve existir
    expect(rows).not.toContain('status')
    await db.close()
  })

  it('C3-RED: tabela dor tem coluna created_at (não "criada_em")', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'dor'
        ORDER BY ordinal_position`,
    )).rows.map((r) => r.column_name)

    expect(rows).toContain('created_at')
    expect(rows).not.toContain('criada_em')
    await db.close()
  })

  it('C3-RED: tabela perfil tem coluna user_id como PK (não "id")', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'perfil'
        ORDER BY ordinal_position`,
    )).rows.map((r) => r.column_name)

    // user_id é a PK correta (0003)
    expect(rows).toContain('user_id')
    // 'id' não deve ser a PK (não deve existir como coluna primária de perfil)
    // perfil não tem uma coluna chamada 'id' — verifica via constraint
    const pks = (await db.query<{ column_name: string }>(
      `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = 'perfil'`,
    )).rows.map((r) => r.column_name)

    expect(pks).toContain('user_id')
    expect(pks).not.toContain('id')
    await db.close()
  })

  it('C3-functional: .eq("status_dor","em_moderacao") retorna dores corretas (não vazia)', async () => {
    const db = await novoBanco()

    // seed mínimo
    await db.exec(`
      INSERT INTO auth.users(id, email) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'rep@empresa.com');
      INSERT INTO public.empresa(nome_canonico, created_by) VALUES ('Empresa Teste', 'aaaaaaaa-0000-0000-0000-000000000001');
    `)
    const empId = (await db.query<{ id: string }>(`SELECT id FROM public.empresa LIMIT 1`)).rows[0]!.id
    await db.exec(`RESET ROLE; SET ROLE service_role;`)
    await db.query(
      `INSERT INTO public.dor(autor_id, empresa_id, status_dor, descricao, rep_nome, consentimento, consent_version, consent_at)
       VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '${empId}', 'em_moderacao', 'Dor de teste com mais de 20 chars aqui', 'Rep', true, 'v1', now())`,
    )
    await db.exec(`RESET ROLE`)

    // query usando o nome correto de coluna (status_dor)
    const result = await db.query<{ n: number }>(
      `SELECT count(*)::int n FROM public.dor WHERE status_dor = 'em_moderacao'`,
    )
    expect(result.rows[0]!.n).toBe(1)

    // ORDER BY created_at deve funcionar (sem erro)
    await expect(
      db.query(`SELECT id FROM public.dor ORDER BY created_at ASC`),
    ).resolves.toBeTruthy()

    await db.close()
  })

  it('C3-functional: .in("user_id", ids) em perfil retorna resultados corretos', async () => {
    const db = await novoBanco()
    await db.exec(`
      INSERT INTO auth.users(id, email) VALUES
        ('bbbbbbbb-0000-0000-0000-000000000001', 'user1@emp.com');
    `)
    await db.exec(`RESET ROLE; SET ROLE service_role;`)
    await db.query(
      `UPDATE public.perfil SET verificado_em = now() WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000001'`,
    )
    await db.exec(`RESET ROLE`)

    // query usando user_id (correto) — deve funcionar e retornar 1 linha
    const result = await db.query<{ user_id: string; verificado_em: string | null }>(
      `SELECT user_id, verificado_em FROM public.perfil
        WHERE user_id IN ('bbbbbbbb-0000-0000-0000-000000000001')`,
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.user_id).toBe('bbbbbbbb-0000-0000-0000-000000000001')
    expect(result.rows[0]!.verificado_em).not.toBeNull()

    await db.close()
  })
})
