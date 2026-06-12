'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface AuditLog {
  id: string
  op: string
  tabela: string
  ator: string
  timestamp: string
  old: Record<string, unknown> | null
  new: Record<string, unknown> | null
}

/**
 * Shape real retornado pela RPC ler_audit v2 (0043).
 * A RPC já aliasa as colunas internamente — chega com os nomes finais:
 * ator (não actor_id), datahora (não ts), old/new (não old_record/record).
 */
interface RawAuditRow {
  id?: number | string
  op?: string
  tabela?: string
  record_id?: string
  ator?: string
  datahora?: string
  old?: Record<string, unknown> | null
  new?: Record<string, unknown> | null
  actor_role?: string
}

function mapRow(row: RawAuditRow): AuditLog {
  return {
    id: row.id != null ? String(row.id) : '',
    op: row.op ?? '',
    tabela: row.tabela ?? '',
    ator: row.ator ?? '',
    timestamp: row.datahora ?? '',
    old: row.old ?? null,
    new: row.new ?? null,
  }
}

export async function lerAudit(limit = 100): Promise<AuditLog[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('ler_audit', { p_limit: limit })
    if (error || !data) return []
    return (data as RawAuditRow[]).map(mapRow)
  } catch {
    return []
  }
}
