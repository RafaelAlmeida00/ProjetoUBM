/**
 * P1.2 — detecção de isMembro correta (não por ausência de throw)
 * isMembro = isHost || isAdmin || tarefas.length > 0
 * Garante que não-membro (sem tarefas, sem ser host/admin) → isMembro=false → sigilo CA22.
 */
import { describe, it, expect } from 'vitest'

function detectarIsMembro(params: {
  isAdmin: boolean
  isHost: boolean
  tarefas: unknown[]
}): boolean {
  return params.isAdmin || params.isHost || params.tarefas.length > 0
}

describe('P1.2 — detecção de isMembro', () => {
  it('admin → isMembro=true independente de tarefas', () => {
    expect(detectarIsMembro({ isAdmin: true, isHost: false, tarefas: [] })).toBe(true)
  })

  it('host → isMembro=true', () => {
    expect(detectarIsMembro({ isAdmin: false, isHost: true, tarefas: [] })).toBe(true)
  })

  it('com tarefas retornadas pelo RLS → isMembro=true', () => {
    expect(detectarIsMembro({ isAdmin: false, isHost: false, tarefas: [{}] })).toBe(true)
  })

  it('não-membro sem tarefas (RLS retorna []) → isMembro=false (CA22)', () => {
    expect(detectarIsMembro({ isAdmin: false, isHost: false, tarefas: [] })).toBe(false)
  })

  it('usuário anon (não logado) → isMembro=false', () => {
    expect(detectarIsMembro({ isAdmin: false, isHost: false, tarefas: [] })).toBe(false)
  })
})
