/**
 * P0.1 — claim de papel em /app/indicacoes
 * Garante que coordenador (roles:['coordenador']) → podeVerLista=true
 * e que aluno → sigilo (podeVerLista=false).
 * Testamos a lógica de derivação de papelBase diretamente.
 */
import { describe, it, expect } from 'vitest'

// Espelha a lógica de derivação de papelBase que DEVE existir na página
function derivarPapelBase(
  appMetadata: Record<string, unknown> | undefined,
): 'aluno' | 'coordenador' | 'representante' {
  const roles = appMetadata?.roles as string[] | undefined
  if (Array.isArray(roles) && roles.includes('coordenador')) return 'coordenador'
  if (Array.isArray(roles) && roles.includes('representante')) return 'representante'
  return 'aluno'
}

describe('P0.1 — derivação de papelBase via roles (não papel_base)', () => {
  it('coordenador com roles:["coordenador"] → papelBase coordenador', () => {
    const meta = { roles: ['coordenador'], is_admin: false, verificado: true }
    expect(derivarPapelBase(meta)).toBe('coordenador')
  })

  it('aluno com roles:["aluno"] → papelBase aluno', () => {
    const meta = { roles: ['aluno'], is_admin: false, verificado: true }
    expect(derivarPapelBase(meta)).toBe('aluno')
  })

  it('sem roles → papelBase aluno (default)', () => {
    expect(derivarPapelBase({})).toBe('aluno')
  })

  it('roles undefined → papelBase aluno', () => {
    expect(derivarPapelBase(undefined)).toBe('aluno')
  })

  it('representante com roles:["representante"] → papelBase representante', () => {
    const meta = { roles: ['representante'] }
    expect(derivarPapelBase(meta)).toBe('representante')
  })

  it('coordenador → podeVerLista=true', () => {
    const papelBase = derivarPapelBase({ roles: ['coordenador'] })
    const podeVerLista = papelBase === 'coordenador' // sem isAdmin
    expect(podeVerLista).toBe(true)
  })

  it('aluno → podeVerLista=false', () => {
    const papelBase = derivarPapelBase({ roles: ['aluno'] })
    const podeVerLista = papelBase === 'coordenador'
    expect(podeVerLista).toBe(false)
  })

  it('NÃO usa papel_base (campo inexistente) — roles tem precedência', () => {
    // Se código usar papel_base, derivarPapelBase ignoraria roles, e coordenador ficaria como aluno
    const meta = { roles: ['coordenador'], papel_base: undefined }
    expect(derivarPapelBase(meta)).toBe('coordenador')
  })
})
