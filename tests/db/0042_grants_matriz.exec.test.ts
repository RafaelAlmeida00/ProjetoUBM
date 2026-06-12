// @vitest-environment node
// T-B3 RED — 0042 re-grant: anon SÓ em submeter_dor_landing v3 + matriz estendida
// Rastreab.: SR-B12, SR-A-H1, SR-A-H2 · VETO-B2 (vetor anon-exec) · STRIDE E-A01
import { describe, it, expect } from 'vitest'
import { novoBanco } from './_pglite/harness'

// Nova assinatura table-returning da submeter_dor_landing v3 (0042)
const SDL_V3 = 'public.submeter_dor_landing(uuid,text,text,text,text,boolean,text,timestamptz,public.curso_ubm[],text,text)'

describe('0042 grants — anon TEM execute em submeter_dor_landing v3', () => {
  it('anon TEM execute em submeter_dor_landing v3 (porta anon — SR-B12)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', $1, 'execute') ok`, [SDL_V3]
    )).rows[0]!.ok
    expect(r, 'anon deve ter execute em submeter_dor_landing v3').toBe(true)
    await db.close()
  })
})

describe('0042 grants — anon NÃO tem execute em nenhuma outra DEFINER (matriz estendida)', () => {
  it('anon: reclamar_dor v3 (uuid,text,uuid) NÃO é executável', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.reclamar_dor(uuid, text, uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em reclamar_dor v3').toBe(false)
    await db.close()
  })

  it('anon: onboarding_representante v2 (5-arg) NÃO é executável', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.onboarding_representante(uuid,text,text,text,text)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em onboarding_representante v2').toBe(false)
    await db.close()
  })

  it('anon: submeter_dor NÃO é executável (regressão)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.submeter_dor(uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em submeter_dor').toBe(false)
    await db.close()
  })

  it('anon: moderar_dor NÃO é executável (regressão)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.moderar_dor(uuid,text,text)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em moderar_dor').toBe(false)
    await db.close()
  })

  it('varredura: anon não executa DEFINER além das legítimas + submeter_dor_landing', async () => {
    const db = await novoBanco()
    const legítimas = [
      'is_admin', 'has_role', 'is_course_coordinator', 'is_company_rep',
      'esta_verificado', 'buscar_empresa', 'verificar_conta', 'normalizar_empresa',
      'submeter_dor_landing',
      'resolver_paleta',
      'is_project_host', 'is_project_coordinator', 'is_team_member', 'is_dor_course_coordinator',
      'equipe_publica', 'timeline_publica',
    ]
    const rows = (await db.query<{ proname: string }>(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef = true
          and has_function_privilege('anon', p.oid, 'execute')`
    )).rows.map(r => r.proname)
    const inesperadas = rows.filter(name => !legítimas.includes(name))
    expect(inesperadas, 'nenhuma DEFINER inesperada para anon').toEqual([])
    await db.close()
  })
})
