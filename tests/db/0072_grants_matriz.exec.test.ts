// @vitest-environment node
/**
 * T2.7 — 0072_hardening_grants_006: nenhuma RPC de escrita da 006 anon-executável
 *
 * RED: RPCs recém-criadas podem ter grant a public/anon (default do Postgres).
 * GREEN: todas as RPCs de escrita da 006 têm revoke anon; authenticated pode chamar as de usuário.
 *
 * spec: RS16/veto V6 · plan §2.6/§8 · security.md (lição 0063 — CREATE OR REPLACE reseta grants)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, comoServiceRole, negado } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

const ADM   = '00000000-0000-0000-0000-000000000004'
const TERC  = '00000000-0000-0000-0000-000000000099'

let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await db.exec(`
    insert into auth.users(id,email) values ('${ADM}','adm@ubm.br'),('${TERC}','terc@ubm.br');
    insert into public.admin_app(user_id) values ('${ADM}');
  `)
})
afterEach(async () => { await db.close() })

// Helper: verifica se anon pode executar a função (pela presença de grant em pg_proc)
async function anonTemGrant(fnName: string, argtypes: string): Promise<boolean> {
  const r = await db.query<{ has: boolean }>(
    `select has_function_privilege('anon', '${fnName}(${argtypes})', 'execute') as has`
  )
  return r.rows[0]!.has
}

describe('0072 hardening grants 006 — anon NUNCA executa RPCs de escrita', () => {
  it('anon não tem grant em enviar_proposta', async () => {
    expect(await anonTemGrant('public.enviar_proposta', 'uuid, text, public.origem_assinatura')).toBe(false)
  })

  it('anon não tem grant em contrapropor_proposta', async () => {
    expect(await anonTemGrant('public.contrapropor_proposta', 'uuid, text')).toBe(false)
  })

  it('anon não tem grant em iniciar_execucao', async () => {
    expect(await anonTemGrant('public.iniciar_execucao', 'uuid')).toBe(false)
  })

  it('anon não tem grant em finalizar_projeto', async () => {
    expect(await anonTemGrant('public.finalizar_projeto', 'uuid')).toBe(false)
  })

  it('anon não tem grant em confirmar_assinatura', async () => {
    expect(await anonTemGrant('public.confirmar_assinatura', 'public.origem_assinatura, text, text, jsonb')).toBe(false)
  })

  it('anon não tem grant em expirar_propostas', async () => {
    expect(await anonTemGrant('public.expirar_propostas', '')).toBe(false)
  })

  it('anon NÃO pode chamar enviar_proposta em runtime', async () => {
    await comoAnon(db)
    expect(await negado(db.query(`select public.enviar_proposta('00000000-0000-0000-0000-000000000000','x.pdf','autentique')`))).toBe(true)
  })

  it('anon NÃO pode chamar contrapropor_proposta em runtime', async () => {
    await comoAnon(db)
    expect(await negado(db.query(`select public.contrapropor_proposta('00000000-0000-0000-0000-000000000000','motivo')`))).toBe(true)
  })

  it('anon NÃO pode chamar iniciar_execucao em runtime', async () => {
    await comoAnon(db)
    expect(await negado(db.query(`select public.iniciar_execucao('00000000-0000-0000-0000-000000000000')`))).toBe(true)
  })

  it('anon NÃO pode chamar finalizar_projeto em runtime', async () => {
    await comoAnon(db)
    expect(await negado(db.query(`select public.finalizar_projeto('00000000-0000-0000-0000-000000000000')`))).toBe(true)
  })

  it('anon NÃO pode chamar confirmar_assinatura em runtime', async () => {
    await comoAnon(db)
    expect(await negado(db.query(`select public.confirmar_assinatura('autentique','prov','caminho.pdf','{"h":"x"}'::jsonb)`))).toBe(true)
  })

  it('anon NÃO pode chamar expirar_propostas em runtime', async () => {
    await comoAnon(db)
    expect(await negado(db.query(`select public.expirar_propostas()`))).toBe(true)
  })

  it('authenticated (não-admin) pode chamar enviar_proposta (gate interno nega, mas grant existe)', async () => {
    await comoUsuario(db, { uid: TERC })
    // a chamada falha pelo gate interno (não é host), mas NÃO por falta de grant
    const err = await db.query(`select public.enviar_proposta('00000000-0000-0000-0000-000000000000','x.pdf','autentique')`).catch(e => e as Error)
    // erro deve ser "permission denied" de lógica interna (não de grant)
    expect(err.message).not.toMatch(/permission denied for function/)
  })

  it('guarda _projeto_guarda_transicao: anon não tem grant (trigger fn)', async () => {
    expect(await anonTemGrant('public._projeto_guarda_transicao', '')).toBe(false)
  })
})
