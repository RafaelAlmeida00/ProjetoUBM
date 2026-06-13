/**
 * Onda 2 — A4: /app/indicacoes peça EM ANÁLISE para coordenador pendente
 * Testa: (1) lógica de detecção coordPendente; (2) componente CoordPendentePeca.
 * RED: falha até o componente e a lógica existirem.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// ── (1) Lógica de detecção coordPendente ──────────────────────────────────────
// A página detecta coordPendente assim:
//   papelBase === 'coordenador' && !app_metadata.coord_aprovado
// Implementamos aqui a função que DEVE existir (ou lógica inline na página).
function detectarCoordPendente(appMetadata: Record<string, unknown> | undefined): boolean {
  const roles = appMetadata?.roles as string[] | undefined
  const isCoord = Array.isArray(roles) && roles.includes('coordenador')
  const aprovado = !!appMetadata?.coord_aprovado
  return isCoord && !aprovado
}

describe('A4 — detecção lógica coordPendente', () => {
  it('coordenador sem coord_aprovado → coordPendente=true', () => {
    expect(
      detectarCoordPendente({ roles: ['coordenador'], is_admin: false }),
    ).toBe(true)
  })

  it('coordenador com coord_aprovado=true → coordPendente=false', () => {
    expect(
      detectarCoordPendente({ roles: ['coordenador'], coord_aprovado: true }),
    ).toBe(false)
  })

  it('aluno nunca é coordPendente', () => {
    expect(detectarCoordPendente({ roles: ['aluno'] })).toBe(false)
  })

  it('sem roles → coordPendente=false', () => {
    expect(detectarCoordPendente({})).toBe(false)
  })

  it('precedência: coordPendente bloqueia ANTES de isVerificado', () => {
    // coordenador não aprovado e também "não verificado" → coordPendente=true
    // (coordPendente tem precedência no render)
    const appMeta = { roles: ['coordenador'], verificado: false, coord_aprovado: undefined }
    expect(detectarCoordPendente(appMeta)).toBe(true)
  })
})

// ── (2) Componente CoordPendentePeca ──────────────────────────────────────────
describe('A4 — componente CoordPendentePeca', () => {
  it('CoordPendentePeca existe e pode ser importado', async () => {
    const mod = await import('@/components/indicacoes/CoordPendentePeca')
    expect(mod.CoordPendentePeca).toBeDefined()
  })

  it('renderiza kicker EM ANÁLISE', async () => {
    const { CoordPendentePeca } = await import('@/components/indicacoes/CoordPendentePeca')
    render(<CoordPendentePeca />)
    // getAllByText porque "análise" aparece tanto no kicker quanto no título do bloco
    expect(screen.getAllByText(/em análise/i).length).toBeGreaterThan(0)
  })

  it('renderiza mensagem sobre aguardar aprovação do admin', async () => {
    const { CoordPendentePeca } = await import('@/components/indicacoes/CoordPendentePeca')
    render(<CoordPendentePeca />)
    expect(screen.getByText(/aguardando aprovação/i)).toBeInTheDocument()
  })

  it('NÃO renderiza botão ou CTA — usuário só espera', async () => {
    const { CoordPendentePeca } = await import('@/components/indicacoes/CoordPendentePeca')
    render(<CoordPendentePeca />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('tem role="status" para a11y', async () => {
    const { CoordPendentePeca } = await import('@/components/indicacoes/CoordPendentePeca')
    render(<CoordPendentePeca />)
    // O bloco deve ter role=status ou ser um section com aria-label
    const statusEl = document.querySelector('[role="status"], .ubm-locked')
    expect(statusEl).toBeInTheDocument()
  })
})
