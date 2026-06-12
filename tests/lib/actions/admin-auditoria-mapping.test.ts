/**
 * T-X1b — FE auditoria: mapping adapter correto para shape REAL da RPC ler_audit v2.
 *
 * Shape real (0043 — RPC já aliasa internamente):
 *   { id bigint, op text, tabela text, ator uuid, datahora timestamptz,
 *     old jsonb, new jsonb, actor_role text, record_id uuid }
 *
 * NÃO chega actor_id / ts / old_record / record — esses são os nomes internos
 * da tabela de auditoria; a RPC os renomeia antes de retornar.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

// Mock com o shape REAL da RPC (nomes já renomeados pela RPC)
const rpcRetorno = [
  {
    id: 42,
    op: 'UPDATE',
    tabela: 'dor',
    ator: 'user-uuid-abc',
    datahora: '2026-06-11T10:00:00Z',
    old: { status: 'em_moderacao' },
    new: { status: 'aprovada' },
    actor_role: 'representante',
    record_id: 'dor-uuid-123',
  },
]

const mockRpc = vi.fn().mockResolvedValue({ data: rpcRetorno, error: null })

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}))

import { lerAudit, type AuditLog } from '@/lib/actions/admin-auditoria'

describe('lerAudit — T-X1b: mapping correto do shape real da RPC (0043)', () => {
  it('X1b-1: mapeia ator → ator (campo direto, não actor_id)', async () => {
    const logs = await lerAudit(10)
    expect(logs.length).toBeGreaterThan(0)
    const log = logs[0] as AuditLog
    expect(log.ator).toBe('user-uuid-abc')
  })

  it('X1b-2: mapeia datahora → timestamp (não ts)', async () => {
    const logs = await lerAudit(10)
    const log = logs[0] as AuditLog
    expect(log.timestamp).toBe('2026-06-11T10:00:00Z')
  })

  it('X1b-3: mapeia old → old (campo direto, não old_record)', async () => {
    const logs = await lerAudit(10)
    const log = logs[0] as AuditLog
    expect((log.old as Record<string, unknown>)?.status).toBe('em_moderacao')
  })

  it('X1b-4: mapeia new → new (campo direto, não record)', async () => {
    const logs = await lerAudit(10)
    const log = logs[0] as AuditLog
    expect((log.new as Record<string, unknown>)?.status).toBe('aprovada')
  })

  it('X1b-5: id convertido para string', async () => {
    const logs = await lerAudit(10)
    const log = logs[0] as AuditLog
    expect(log.id).toBe('42')
  })

  it('X1b-6: nenhum campo obrigatório é undefined após o mapping', async () => {
    const logs = await lerAudit(10)
    const log = logs[0] as AuditLog
    expect(log.id).toBeDefined()
    expect(log.ator).toBeDefined()
    expect(log.timestamp).toBeDefined()
    expect(log.op).toBeDefined()
    expect(log.tabela).toBeDefined()
  })
})
