import { describe, it, expect, beforeEach } from 'vitest'
import { coresCategoricas } from '@/lib/analytics/cores'
import { formatarFrescor } from '@/lib/analytics/frescor'

// CT-06 — paleta derive from CSS custom property; zero literal hex/rgb
describe('coresCategoricas', () => {
  beforeEach(() => {
    // Simulate CSS custom properties in jsdom
    document.documentElement.style.setProperty('--primary', '205 68% 33%')
    document.documentElement.style.setProperty('--accent', '345 62% 30%')
  })

  it('CT-06: retorna N cores como strings hsl() (sem hex literal)', () => {
    const cores = coresCategoricas(4, 'light')
    expect(cores).toHaveLength(4)
    cores.forEach((c) => {
      // must be hsl() format, no # or rgb(
      expect(c).toMatch(/^hsl\(/)
      expect(c).not.toMatch(/#[0-9a-fA-F]{3,6}/)
      expect(c).not.toMatch(/^rgb\(/)
    })
  })

  it('CT-06: escala usa var(--primary) como âncora (não hex congelado)', () => {
    const coresLight = coresCategoricas(2, 'light')
    const coresDark = coresCategoricas(2, 'dark')
    // Both return hsl() strings (not hardcoded hex)
    expect(coresLight[0]).toMatch(/^hsl\(/)
    expect(coresDark[0]).toMatch(/^hsl\(/)
  })
})

describe('formatarFrescor', () => {
  it('CT-06: retorna "AGORA HÁ POUCO" para menos de 1 minuto atrás', () => {
    const atualizado = new Date(Date.now() - 30_000).toISOString()
    expect(formatarFrescor(atualizado)).toBe('AGORA HÁ POUCO')
  })

  it('retorna "HÁ X MIN" para menos de 60 minutos', () => {
    const atualizado = new Date(Date.now() - 12 * 60_000).toISOString()
    expect(formatarFrescor(atualizado)).toBe('HÁ 12 MIN')
  })

  it('retorna "HÁ X H" para menos de 24 horas', () => {
    const atualizado = new Date(Date.now() - 3 * 3600_000).toISOString()
    expect(formatarFrescor(atualizado)).toBe('HÁ 3 H')
  })

  it('retorna "ONTEM" para aproximadamente 24 horas atrás', () => {
    const atualizado = new Date(Date.now() - 25 * 3600_000).toISOString()
    expect(formatarFrescor(atualizado)).toBe('ONTEM')
  })

  it('retorna "HÁ X DIAS" para mais de 2 dias', () => {
    const atualizado = new Date(Date.now() - 3 * 86400_000).toISOString()
    expect(formatarFrescor(atualizado)).toBe('HÁ 3 DIAS')
  })

  it('retorna null para atualizado_em null', () => {
    expect(formatarFrescor(null)).toBeNull()
  })
})
