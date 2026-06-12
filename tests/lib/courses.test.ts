import { describe, it, expect } from 'vitest'
import { CURSOS_UBM, CURSO_VALUES, isCursoValido } from '@/lib/courses'
import { GRADUACOES_ESPERADAS } from '../../fixtures/courses.fixture'

// T1a — RN4 / spec §9
describe('lib/courses', () => {
  it('tem as 17 graduações + "Não sei" (18 itens)', () => {
    expect(CURSOS_UBM).toHaveLength(18)
    const labels = CURSOS_UBM.map((c) => c.label)
    for (const g of GRADUACOES_ESPERADAS) expect(labels).toContain(g)
    expect(labels).toContain('Não sei / me ajudem a identificar')
  })

  it('valida pertencimento à lista fechada (allowlist — RS5)', () => {
    expect(isCursoValido('engenharia_de_software')).toBe(true)
    expect(isCursoValido('nao_sei')).toBe(true)
    expect(isCursoValido('medicina')).toBe(false) // não ofertado pela UBM
    expect(isCursoValido('')).toBe(false)
  })

  it('CURSO_VALUES espelha os values e inclui "nao_sei"', () => {
    expect(CURSO_VALUES).toHaveLength(18)
    expect(CURSO_VALUES).toContain('nutricao')
    expect(CURSO_VALUES).toContain('nao_sei')
  })
})
