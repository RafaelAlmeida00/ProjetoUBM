import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// Harness de teste de banco: PGlite (Postgres WASM) + shim Supabase + migrações reais.
// cwd do vitest = workspace/src; migrações em src/supabase/migrations; shim na suíte (../tests).
const ROOT = process.cwd()
const MIGR_DIR = path.resolve(ROOT, 'supabase/migrations')
const SHIM = path.resolve(ROOT, '..', 'tests/db/_pglite/bootstrap/00_supabase_shim.sql')

export interface Identidade {
  uid?: string
  email?: string | null
  /** app_metadata: CONFIÁVEL (vem do Auth Hook; usado em authz). */
  appMeta?: Record<string, unknown>
  /** user_metadata: EDITÁVEL pelo usuário — NUNCA usar em authz (teste anti-escalonamento). */
  userMeta?: Record<string, unknown>
}

/** Sobe um Postgres efêmero: shim + migrações 0001..N (ou até `ate`) + grants estilo Supabase. */
export async function novoBanco(opts: { ate?: string } = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm } }) // pg_trgm p/ busca fuzzy (003)
  await db.exec(readFileSync(SHIM, 'utf8'))
  const files = readdirSync(MIGR_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of files) {
    if (opts.ate && f > opts.ate) break
    await db.exec(readFileSync(path.join(MIGR_DIR, f), 'utf8'))
  }
  // Os grants vêm das DEFAULT PRIVILEGES do shim (tabelas nascem com grant), preservando
  // revokes por coluna feitos pelas migrações. Nada de grant-all aqui (sobrescreveria revokes).
  return db
}

async function identidade(
  db: PGlite,
  role: 'anon' | 'authenticated' | 'service_role',
  claims: Record<string, unknown>,
): Promise<void> {
  await db.exec('reset role;')
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)])
  await db.exec(`set role ${role};`)
}

/** Visitante não autenticado. */
export const comoAnon = (db: PGlite) => identidade(db, 'anon', { role: 'anon' })

/** Role de serviço (bypassa RLS) — só para caminhos server-only (webhook/job). */
export const comoServiceRole = (db: PGlite) => identidade(db, 'service_role', { role: 'service_role' })

/** Usuário autenticado. Papéis/scope/verificação vêm de TABELAS (não de claims); só app_metadata.is_admin é claim. */
export const comoUsuario = (db: PGlite, id: Identidade) =>
  identidade(db, 'authenticated', {
    sub: id.uid,
    role: 'authenticated',
    email: id.email ?? null,
    app_metadata: id.appMeta ?? {},
    user_metadata: id.userMeta ?? {},
  })

/** Açúcar p/ asserções de deny: resolve true se a query lançar (acesso negado / violação de policy). */
export async function negado(p: Promise<unknown>): Promise<boolean> {
  try {
    await p
    return false
  } catch {
    return true
  }
}
