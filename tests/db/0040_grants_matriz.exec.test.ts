// @vitest-environment node
// T-AN4 RED — 0040 re-grant cirúrgico: anon SÓ em submeter_dor_landing + estender teste de matriz
// Rastreab.: SR-A1, SR-A-H1, SR-A-H2 · STRIDE E-A01 · VETO-AN (vetor anon-exec)
import { describe, it, expect } from 'vitest'
import { novoBanco } from './_pglite/harness'

// Assinatura nova da submeter_dor_landing (10 params após drop+create em 0040)
const SDL_SIG = 'public.submeter_dor_landing(uuid,text,text,text,text,boolean,text,timestamptz,public.curso_ubm[],text,text)'

describe('0040 grants — anon TEM execute em submeter_dor_landing (nova assinatura)', () => {
  it('anon TEM execute em submeter_dor_landing (re-grant cirúrgico 0040)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', $1, 'execute') ok`,
      [SDL_SIG]
    )).rows[0]!.ok
    expect(r, 'anon deve ter execute em submeter_dor_landing (porta anon)').toBe(true)
    await db.close()
  })
})

describe('0040 grants — anon NÃO tem execute em nenhuma outra DEFINER (matriz intacta)', () => {
  it('anon: submeter_dor NÃO é executável', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.submeter_dor(uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em submeter_dor').toBe(false)
    await db.close()
  })

  it('anon: moderar_dor NÃO é executável', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.moderar_dor(uuid,text,text)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em moderar_dor').toBe(false)
    await db.close()
  })

  it('anon: reclamar_dor NÃO é executável', async () => {
    const db = await novoBanco()
    // Após 0042, assinatura é reclamar_dor(uuid, text, uuid) — token one-shot.
    // Invariante SR-A-H3 preservado: anon nunca executa reclamar_dor.
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.reclamar_dor(uuid, text, uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em reclamar_dor').toBe(false)
    await db.close()
  })

  it('anon: onboarding_representante NÃO é executável', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.onboarding_representante(uuid,text,text,text,text)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em onboarding_representante').toBe(false)
    await db.close()
  })

  it('anon: obter_ou_criar_empresa NÃO é executável', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.obter_ou_criar_empresa(text)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em obter_ou_criar_empresa').toBe(false)
    await db.close()
  })

  it('anon: erasure_titular NÃO é executável', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.erasure_titular(uuid)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon não deve ter execute em erasure_titular').toBe(false)
    await db.close()
  })

  it('varredura: anon não executa DEFINER alguma além de submeter_dor_landing (SR-A-H2)', async () => {
    const db = await novoBanco()
    // Lista todas as funções DEFINER que anon pode executar além das legítimas (is_admin, buscar_empresa etc.)
    // Funções DEFINER com grant legítimo de anon (usadas em RLS/landing por features 004+005+007):
    // - is_admin, has_role, esta_verificado, is_course_coordinator, is_company_rep: helpers RLS base
    // - buscar_empresa, verificar_conta, normalizar_empresa: landing pública / link de verificação
    // - submeter_dor_landing: ÚNICA porta de escrita anon (004 delta — SR-A1)
    // - resolver_paleta: helper RLS paleta 007 (leitura pública)
    // - is_project_host, is_project_coordinator, is_team_member, is_dor_course_coordinator: RLS 005 (projetos/equipes, leitura pública)
    // - equipe_publica, timeline_publica: leitura pública 005/007 (RLS anon legítimo)
    const legítimas = [
      'is_admin', 'has_role', 'is_course_coordinator', 'is_company_rep',
      'esta_verificado', 'buscar_empresa', 'verificar_conta', 'normalizar_empresa',
      'submeter_dor_landing',   // ÚNICA escrita anon (SR-A1 — 004 delta)
      'resolver_paleta',        // 007 — helper RLS paleta (leitura pública)
      'is_project_host',        // 005 — helper RLS projetos (leitura pública)
      'is_project_coordinator', // 005 — idem
      'is_team_member',         // 005 — idem
      'is_dor_course_coordinator', // 005 — idem
      'equipe_publica',         // 005 — visibilidade pública equipe
      'timeline_publica',       // 005 — visibilidade pública timeline
    ]  // submeter_dor_landing é a ÚNICA porta de escrita anon
    const rows = (await db.query<{ proname: string }>(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef = true  -- só SECURITY DEFINER
          and has_function_privilege('anon', p.oid, 'execute')`
    )).rows.map(r => r.proname)

    // Filtra as legítimas
    const inesperadas = rows.filter(name => !legítimas.includes(name))
    expect(inesperadas, 'nenhuma DEFINER inesperada deve ter execute para anon').toEqual([])
    await db.close()
  })
})

describe('0040 grants — legítimas de anon mantidas (regressão)', () => {
  it('anon: is_admin() MANTÉM execute (RLS)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.is_admin()', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon deve manter execute em is_admin').toBe(true)
    await db.close()
  })

  it('anon: buscar_empresa() MANTÉM execute (landing pública)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.buscar_empresa(text)', 'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon deve manter execute em buscar_empresa').toBe(true)
    await db.close()
  })
})
