/**
 * T-B15 — Validação de e-mail corporativo (módulo testável isolado).
 *
 * Estes testes provam a RÉGUA DE DOMÍNIO sem depender de componentes React.
 * Se DOMINIOS_GRATUITOS for removido ou isEmailCorporativo for enfraquecido,
 * os testes EC-3/EC-4 falham — garantia de não-vácuo.
 */
import { describe, it, expect } from 'vitest'
import {
  DOMINIOS_GRATUITOS,
  validarEmailCorporativo,
  isEmailCorporativo,
} from '@/lib/validation/email-corporativo'

describe('isEmailCorporativo', () => {
  it('EC-1: e-mail com domínio corporativo real → true', () => {
    expect(isEmailCorporativo('ana@empresa.com.br')).toBe(true)
    expect(isEmailCorporativo('contato@ubm.edu.br')).toBe(true)
    expect(isEmailCorporativo('ti@minhaempresa.com')).toBe(true)
  })

  it('EC-2: campo vazio → false', () => {
    expect(isEmailCorporativo('')).toBe(false)
  })

  it('EC-3: domínios gratuitos conhecidos → false (prova a régua)', () => {
    expect(isEmailCorporativo('usuario@gmail.com')).toBe(false)
    expect(isEmailCorporativo('usuario@hotmail.com')).toBe(false)
    expect(isEmailCorporativo('usuario@outlook.com')).toBe(false)
    expect(isEmailCorporativo('usuario@yahoo.com')).toBe(false)
    expect(isEmailCorporativo('usuario@yahoo.com.br')).toBe(false)
    expect(isEmailCorporativo('usuario@icloud.com')).toBe(false)
    expect(isEmailCorporativo('usuario@protonmail.com')).toBe(false)
    expect(isEmailCorporativo('usuario@proton.me')).toBe(false)
  })

  it('EC-4: domínio gratuito em maiúscula → false (case-insensitive)', () => {
    expect(isEmailCorporativo('usuario@GMAIL.COM')).toBe(false)
    expect(isEmailCorporativo('usuario@Hotmail.Com')).toBe(false)
  })

  it('EC-5: e-mail malformado sem @ → false', () => {
    expect(isEmailCorporativo('semarroba')).toBe(false)
    expect(isEmailCorporativo('@semlocal.com')).toBe(false)
    expect(isEmailCorporativo('semdominio@')).toBe(false)
  })

  it('EC-6: DOMINIOS_GRATUITOS contém pelo menos os 14 domínios da spec §6', () => {
    const esperados = [
      'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
      'yahoo.com', 'yahoo.com.br', 'icloud.com', 'bol.com.br', 'uol.com.br',
      'terra.com.br', 'globo.com', 'protonmail.com', 'proton.me',
    ]
    for (const d of esperados) {
      expect(DOMINIOS_GRATUITOS.has(d)).toBe(true)
    }
  })
})

describe('validarEmailCorporativo', () => {
  it('EC-7: e-mail corporativo válido → null (sem erro)', () => {
    expect(validarEmailCorporativo('ana@empresa.com.br')).toBeNull()
  })

  it('EC-8: campo vazio → null (não validar ainda)', () => {
    expect(validarEmailCorporativo('')).toBeNull()
  })

  it('EC-9: @gmail.com → mensagem com exemplo de domínio (spec §6)', () => {
    const msg = validarEmailCorporativo('x@gmail.com')
    expect(msg).not.toBeNull()
    expect(msg).toMatch(/dom[ií]nio da sua empresa/i)
    expect(msg).toMatch(/suaempresa\.com\.br/i)
  })

  it('EC-10: e-mail sem @ → mensagem sobre @ ausente', () => {
    const msg = validarEmailCorporativo('semarroba')
    expect(msg).not.toBeNull()
    expect(msg).toMatch(/@/i)
  })
})
