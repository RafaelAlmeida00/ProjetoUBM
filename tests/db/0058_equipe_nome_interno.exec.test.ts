// @vitest-environment node
/**
 * 0058 — equipe_publica/timeline_publica audience-aware.
 * Requisito: audiência INTERNA (admin/host/coordenador-do-curso/membro) vê o NOME real;
 * a vitrine pública (anon) continua anonimizada por ranking_optin (RS9/LGPD).
 * Também corrige o contrato com o FE (nome_ou_papel + nome_revelado + ranking_optin).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

const U_MEMBER = '00000000-0000-0000-0000-0000000000a1'
const U_ADMIN = '00000000-0000-0000-0000-0000000000a2'
const U_OUT = '00000000-0000-0000-0000-0000000000a3'

let db: PGlite
let pid: string

beforeEach(async () => {
  db = await novoBanco()
  // Seed no role default (superuser) — auth.users só aceita insert do superuser, como no 0036.
  await db.exec(`
    insert into auth.users(id,email) values
      ('${U_MEMBER}','membro@ubm.br'),('${U_ADMIN}','adm@ubm.br'),('${U_OUT}','fora@ubm.br');
    insert into public.admin_app(user_id) values ('${U_ADMIN}');
    update public.perfil set nome_publico='Fulano da Silva', ranking_optin=false where user_id='${U_MEMBER}';
    insert into public.empresa(nome_canonico, created_by) values ('ACME','${U_MEMBER}');
  `)
  const eid = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  const did = (await db.query<{ id: string }>(
    `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
     values ('${U_MEMBER}','${eid}','em_moderacao','Dor 058','Rep',true,'v1',now()) returning id`)).rows[0]!.id
  pid = (await db.query<{ id: string }>(
    `insert into public.projeto(dor_id,status) values ('${did}','em_analise') returning id`)).rows[0]!.id
  await db.query(`insert into public.membro_equipe(projeto_id,pessoa_id,papel_projeto) values ('${pid}','${U_MEMBER}','host')`)
})

afterEach(async () => { await db.close() })

async function equipe() {
  return (await db.query(`select * from public.equipe_publica('${pid}')`)).rows as Array<{
    papel_projeto: string; nome_ou_papel: string; nome_revelado: boolean; ranking_optin: boolean; curso: string | null
  }>
}

describe('0058 equipe_publica — nome interno revelado; vitrine anon anonimizada', () => {
  it('admin revela o nome real mesmo com ranking_optin=false', async () => {
    await comoUsuario(db, { uid: U_ADMIN, appMeta: { is_admin: true } })
    const [m] = await equipe()
    expect(m.nome_revelado).toBe(true)
    expect(m.nome_ou_papel).toBe('Fulano da Silva')
  })

  it('membro do projeto (interno) revela o nome real', async () => {
    await comoUsuario(db, { uid: U_MEMBER })
    const [m] = await equipe()
    expect(m.nome_revelado).toBe(true)
    expect(m.nome_ou_papel).toBe('Fulano da Silva')
  })

  it('anon (vitrine) sem opt-in NÃO revela → fallback de papel', async () => {
    await comoAnon(db)
    const [m] = await equipe()
    expect(m.nome_revelado).toBe(false)
    expect(m.ranking_optin).toBe(false)
    expect(m.nome_ou_papel).toBe('Host')
  })

  it('autenticado de fora (não membro/coord/admin) é tratado como público', async () => {
    await comoUsuario(db, { uid: U_OUT })
    const [m] = await equipe()
    expect(m.nome_revelado).toBe(false)
  })

  it('com ranking_optin=true o nome aparece até para anon', async () => {
    await comoServiceRole(db)
    await db.exec(`update public.perfil set ranking_optin=true where user_id='${U_MEMBER}'`)
    await comoAnon(db)
    const [m] = await equipe()
    expect(m.nome_revelado).toBe(true)
    expect(m.nome_ou_papel).toBe('Fulano da Silva')
  })

  it('a projeção nunca expõe pessoa_id/user_id (RS9)', async () => {
    await comoUsuario(db, { uid: U_ADMIN, appMeta: { is_admin: true } })
    const cols = Object.keys((await equipe())[0]!)
    expect(cols).not.toContain('pessoa_id')
    expect(cols).not.toContain('user_id')
  })
})
