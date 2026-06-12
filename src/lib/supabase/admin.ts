import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './env'

// ⚠️ SERVER-ONLY. Client com a chave de serviço (bypassa RLS). Importar SOMENTE em
// Route Handlers de webhook (ex.: app/api/webhooks/**) e jobs — NUNCA em página/componente.
// A chave NÃO é NEXT_PUBLIC (o Next não a inclui no bundle do cliente).
export function createSupabaseAdminClient() {
  const url = SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin (server-only) env ausente')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
