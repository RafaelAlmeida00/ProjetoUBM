// @vitest-environment node
/**
 * C2 — getMinhaIdentidade: coluna correta no banco
 * Testa a action getMinhaIdentidade contra PGlite real (com schema 0027).
 * Bug C2: o código usava .select('papel') mas a coluna é 'role' (migração 0003).
 * Este teste pega a regressão: sem a correção, a query erraria e o catch
 * retornaria otimista { temPapel: true } mesmo para usuário SEM papel.
 *
 * RN21-24 / CA24 / architecture D.7
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

// UIDs de teste
const UID_SEM_PAPEL   = '00000000-0000-0000-0000-000000000011'
const UID_COM_PAPEL   = '00000000-0000-0000-0000-000000000022'

// ── Shim: substitui createSupabaseServerClient pelo cliente PGlite ──────────
// O shim expõe uma API compatível com o cliente Supabase usado por getMinhaIdentidade.
// Fazemos isso para exercitar a lógica real da action sem mockar o banco todo.

let db: PGlite
let shimUserId: string | null = null

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => {
        if (!shimUserId) return { data: { user: null }, error: null }
        return {
          data: { user: { id: shimUserId } },
          error: null,
        }
      }),
    },
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: (_col: string, val: string) => ({
          // Executa a query real contra o PGlite
          then: async (resolve: (v: { data: unknown[]; error: null }) => void) => {
            try {
              // Monta a query a partir dos parâmetros capturados
              const result = await db.query<Record<string, unknown>>(
                `SELECT ${cols} FROM public.${table} WHERE user_id = $1`,
                [val],
              )
              resolve({ data: result.rows, error: null })
            } catch (err) {
              // Simula o comportamento do cliente Supabase: retorna error em vez de throw
              resolve({ data: [], error: err } as never)
            }
          },
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/supabase/env', () => ({
  hasSupabaseEnv: vi.fn(() => true),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], setAll: () => {} })),
}))

describe('getMinhaIdentidade — C2: coluna role (não papel) no PGlite real', () => {
  beforeEach(async () => {
    db = await novoBanco()
    // Insere os dois usuários de teste
    await db.exec(`
      INSERT INTO auth.users(id, email) VALUES
        ('${UID_SEM_PAPEL}', 'sempapel@empresa.com'),
        ('${UID_COM_PAPEL}', 'compapel@empresa.com');
      -- Insere papel para UID_COM_PAPEL usando a coluna correta 'role'
      INSERT INTO public.papel_usuario(user_id, role)
        VALUES ('${UID_COM_PAPEL}', 'representante');
    `)
  })

  afterEach(async () => {
    await db.close()
    shimUserId = null
  })

  it('C2-RED: usuário SEM papel → temPapel:false (bug: com coluna errada cai no catch otimista → true)', async () => {
    shimUserId = UID_SEM_PAPEL
    const { getMinhaIdentidade } = await import('@/lib/actions/onboarding')
    const result = await getMinhaIdentidade()
    // Com a coluna 'papel' (bug), a query erra → catch retorna { temPapel: true }
    // Com a coluna 'role' (correto), a query retorna 0 rows → { temPapel: false }
    expect(result.temPapel).toBe(false)
    expect(result.papeis).toHaveLength(0)
  })

  it('C2-GREEN: usuário COM papel → temPapel:true e papel listado', async () => {
    shimUserId = UID_COM_PAPEL
    const { getMinhaIdentidade } = await import('@/lib/actions/onboarding')
    const result = await getMinhaIdentidade()
    expect(result.temPapel).toBe(true)
    expect(result.papeis).toContain('representante')
  })

  it('C2-GREEN: usuário não autenticado (null) → temPapel:false', async () => {
    shimUserId = null
    const { getMinhaIdentidade } = await import('@/lib/actions/onboarding')
    const result = await getMinhaIdentidade()
    expect(result.temPapel).toBe(false)
  })
})
