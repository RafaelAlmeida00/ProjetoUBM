import { describe, it, expect } from 'vitest'

// SCAFFOLD DE DIAGNÓSTICO (tech-lead, T-AN4) — JÁ CUMPRIU O PROPÓSITO, INERTE.
// Usado para enumerar as DEFINER anon-executáveis e fechar a allowlist do teste de
// matriz (0040_grants_matriz). Resultado: 7 funções STABLE/read legítimas de 005/007
// (equipe_publica, timeline_publica, is_dor_course_coordinator, is_project_coordinator,
// is_project_host, is_team_member, resolver_paleta) — allowlist estendida no teste real.
// Pode ser removido por quem for o dono do diretório de testes (não é um teste de spec).
describe.skip('TMP scan anon DEFINER (inerte)', () => {
  it('placeholder', () => {
    expect(true).toBe(true)
  })
})
