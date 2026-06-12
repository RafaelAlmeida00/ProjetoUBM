// @vitest-environment node
// T-O1.9 — hardening: revoke execute de public + re-grant mínimo
// RN27 · RS11, RS15
import { describe, it, expect } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, negado } from './_pglite/harness'

const U = '00000000-0000-0000-0000-0000000000ff'

describe('0038 hardening — revoke/grant execute', () => {
  it('anon NÃO executa RPCs de mutação (revoke from public)', async () => {
    const db = await novoBanco({ ate: '0038_hardening_revoke_execute.sql' })
    await comoAnon(db)
    expect(await negado(db.query(`select public.indicar_se('${U}','aluno',null)`)), 'anon não executa indicar_se').toBe(true)
    expect(await negado(db.query(`select public.fechar_equipe('${U}','${U}','[]'::jsonb)`)), 'anon não executa fechar_equipe').toBe(true)
    expect(await negado(db.query(`select public.avancar_projeto('${U}')`)), 'anon não executa avancar_projeto').toBe(true)
    expect(await negado(db.query(`select public.trocar_host('${U}','${U}')`)), 'anon não executa trocar_host').toBe(true)
    expect(await negado(db.query(`select public.override_transicao('${U}','aprovado','x')`)), 'anon não executa override').toBe(true)
    await db.close()
  })

  it('anon EXECUTA as funções públicas (vitrine + helpers re-grant)', async () => {
    const db = await novoBanco({ ate: '0038_hardening_revoke_execute.sql' })
    await comoAnon(db)
    // sem erro de permissão (projeto inexistente → resultado vazio/false)
    await db.query(`select * from public.equipe_publica('${U}')`)
    await db.query(`select * from public.timeline_publica('${U}')`)
    await db.query(`select public.is_team_member('${U}')`)
    await db.query(`select public.is_dor_course_coordinator('${U}')`)
    expect(true).toBe(true)
    await db.close()
  })

  it('authenticated EXECUTA as RPCs de mutação (permissão concedida; falha só por regra de negócio)', async () => {
    const db = await novoBanco({ ate: '0038_hardening_revoke_execute.sql' })
    await comoUsuario(db, { uid: U })
    // avancar_projeto em projeto inexistente: no-op (where status='aprovado' → 0 linhas) — SEM erro de permissão
    await db.query(`select public.avancar_projeto('${U}')`)
    expect(true).toBe(true)
    await db.close()
  })
})
