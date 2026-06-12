/**
 * T-B16b — Loaders comunicantes (design-system §motion + spec ux-ui §2/§3)
 *
 * Cada loading.tsx deve:
 * - NÃO renderizar Loader2 / spinner centrado isolado
 * - NÃO usar microcopy genérica ("Preparando seu espaço…" / "Carregando…")
 * - Renderizar blocos .ubm-sk com aria-hidden (decorativos)
 * - Renderizar faixa comunicante role="status" aria-live="polite" com dots + microcopy contextual
 * - Usar APENAS classes .ubm-sk* (sem Loader2 import)
 *
 * RED: todos falham antes da implementação (os arquivos atuais têm Loader2 + copy genérica).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Imports dos 7 loading.tsx ────────────────────────────────────────────────
import AdminDoresLoading from '@/app/admin/dores/loading'
import AdminUsuariosLoading from '@/app/admin/usuarios/loading'
import AdminAuditoriaLoading from '@/app/admin/auditoria/loading'
import AdminEmpresasLoading from '@/app/admin/empresas/loading'
import AdminBackfillLoading from '@/app/admin/backfill/loading'
import AppDoresLoading from '@/app/app/dores/loading'
import AppDoresIdLoading from '@/app/app/dores/[id]/loading'

// ── Helper: busca elementos por classe CSS ───────────────────────────────────
function getAllByClass(container: HTMLElement, cls: string) {
  return Array.from(container.querySelectorAll(`.${cls}`))
}

// ── Helper: verifica ausência do spinner genérico ────────────────────────────
function assertNoGenericSpinner(container: HTMLElement) {
  // Nenhum svg com classe animate-spin (Loader2)
  const spinners = container.querySelectorAll('svg.animate-spin, svg.ubm-spinner')
  expect(spinners.length, 'spinner genérico Loader2 não deve estar presente').toBe(0)
}

// ── Helper: verifica microcopy contextual ────────────────────────────────────
function assertContextualMicrocopy(text: string) {
  // Microcopy genérica proibida
  const allText = document.body.textContent ?? ''
  expect(allText).not.toContain('Preparando seu espaço')
  expect(allText).not.toContain('Carregando…')
  // Microcopy correta presente
  expect(allText).toContain(text)
}

// ── Helper: verifica faixa comunicante acessível ─────────────────────────────
function assertStatusRegion(container: HTMLElement) {
  const statusEl = container.querySelector('[role="status"][aria-live="polite"]')
  expect(statusEl, 'deve ter region role=status aria-live=polite').toBeTruthy()
  const dots = statusEl!.querySelectorAll('.ubm-sk-dots > span')
  expect(dots.length, 'faixa comunicante deve ter 3 dots escalonados').toBe(3)
}

// ── Helper: verifica blocos skeleton ─────────────────────────────────────────
function assertSkeletonBlocks(container: HTMLElement, minCount = 3) {
  const skBlocks = container.querySelectorAll(
    '[class*="ubm-sk"][aria-hidden="true"], [class*="ubm-sk-card"]',
  )
  expect(skBlocks.length, `deve ter ao menos ${minCount} blocos skeleton aria-hidden`).toBeGreaterThanOrEqual(minCount)
}

// ════════════════════════════════════════════════════════════════════════════════
describe('B16b-1 — /admin/dores loading: skeleton de fila de moderação', () => {
  it('B16b-1a: não renderiza spinner Loader2 nem copy genérica', () => {
    const { container } = render(<AdminDoresLoading />)
    assertNoGenericSpinner(container)
    assertContextualMicrocopy('Carregando a fila de moderação')
  })

  it('B16b-1b: faixa comunicante role=status com 3 dots e microcopy contextual', () => {
    const { container } = render(<AdminDoresLoading />)
    assertStatusRegion(container)
  })

  it('B16b-1c: renderiza ao menos 4 ubm-sk-card (esqueleto de fila)', () => {
    const { container } = render(<AdminDoresLoading />)
    const cards = getAllByClass(container, 'ubm-sk-card')
    expect(cards.length, 'deve ter 4 ubm-sk-card').toBeGreaterThanOrEqual(4)
  })

  it('B16b-1d: blocos skeleton com aria-hidden (decorativos)', () => {
    const { container } = render(<AdminDoresLoading />)
    assertSkeletonBlocks(container, 4)
  })
})

describe('B16b-2 — /admin/usuarios loading: skeleton de tabela', () => {
  it('B16b-2a: não renderiza spinner Loader2 nem copy genérica', () => {
    const { container } = render(<AdminUsuariosLoading />)
    assertNoGenericSpinner(container)
    assertContextualMicrocopy('Buscando usuários e papéis')
  })

  it('B16b-2b: faixa comunicante role=status com 3 dots', () => {
    const { container } = render(<AdminUsuariosLoading />)
    assertStatusRegion(container)
  })

  it('B16b-2c: renderiza "tabela fantasma" (linhas de skeleton)', () => {
    const { container } = render(<AdminUsuariosLoading />)
    // Tabela fantasma: pelo menos 6 linhas tr de skeleton
    const rows = container.querySelectorAll('tr[aria-hidden="true"]')
    expect(rows.length, 'tabela fantasma deve ter ≥6 linhas').toBeGreaterThanOrEqual(6)
  })
})

describe('B16b-3 — /admin/auditoria loading: skeleton de tabela de auditoria', () => {
  it('B16b-3a: não renderiza spinner Loader2 nem copy genérica', () => {
    const { container } = render(<AdminAuditoriaLoading />)
    assertNoGenericSpinner(container)
    assertContextualMicrocopy('Abrindo a trilha de auditoria')
  })

  it('B16b-3b: faixa comunicante role=status com 3 dots', () => {
    const { container } = render(<AdminAuditoriaLoading />)
    assertStatusRegion(container)
  })

  it('B16b-3c: renderiza tabela fantasma com linhas de skeleton', () => {
    const { container } = render(<AdminAuditoriaLoading />)
    const rows = container.querySelectorAll('tr[aria-hidden="true"]')
    expect(rows.length, 'tabela fantasma deve ter ≥6 linhas').toBeGreaterThanOrEqual(6)
  })
})

describe('B16b-4 — /admin/empresas loading: skeleton de lista de cards de ação', () => {
  it('B16b-4a: não renderiza spinner Loader2 nem copy genérica', () => {
    const { container } = render(<AdminEmpresasLoading />)
    assertNoGenericSpinner(container)
    assertContextualMicrocopy('Carregando as empresas cadastradas')
  })

  it('B16b-4b: faixa comunicante role=status com 3 dots', () => {
    const { container } = render(<AdminEmpresasLoading />)
    assertStatusRegion(container)
  })

  it('B16b-4c: renderiza 3 cards ubm-machined skeleton', () => {
    const { container } = render(<AdminEmpresasLoading />)
    const cards = getAllByClass(container, 'ubm-machined')
    // Inclui o wrapper + 3 cards de conteúdo; ao menos 3
    expect(cards.length, 'deve ter ao menos 3 cards machined').toBeGreaterThanOrEqual(3)
  })
})

describe('B16b-5 — /admin/backfill loading: skeleton de lista de cards de manutenção', () => {
  it('B16b-5a: não renderiza spinner Loader2 nem copy genérica', () => {
    const { container } = render(<AdminBackfillLoading />)
    assertNoGenericSpinner(container)
    assertContextualMicrocopy('Preparando as ferramentas de manutenção')
  })

  it('B16b-5b: faixa comunicante role=status com 3 dots', () => {
    const { container } = render(<AdminBackfillLoading />)
    assertStatusRegion(container)
  })
})

describe('B16b-6 — /app/dores loading: skeleton de vitrine (grade de cards)', () => {
  it('B16b-6a: não renderiza spinner Loader2 nem copy genérica', () => {
    const { container } = render(<AppDoresLoading />)
    assertNoGenericSpinner(container)
    assertContextualMicrocopy('Reunindo as dores publicadas')
  })

  it('B16b-6b: faixa comunicante role=status com 3 dots', () => {
    const { container } = render(<AppDoresLoading />)
    assertStatusRegion(container)
  })

  it('B16b-6c: renderiza ubm-dor-grid com 6 ubm-sk-card', () => {
    const { container } = render(<AppDoresLoading />)
    const grid = container.querySelector('.ubm-dor-grid')
    expect(grid, 'deve ter .ubm-dor-grid').toBeTruthy()
    const cards = grid!.querySelectorAll('.ubm-sk-card')
    expect(cards.length, 'grade deve ter 6 ubm-sk-card').toBe(6)
  })
})

describe('B16b-7 — /app/dores/[id] loading: skeleton de detalhe de dor', () => {
  it('B16b-7a: não renderiza spinner Loader2 nem copy genérica', () => {
    const { container } = render(<AppDoresIdLoading />)
    assertNoGenericSpinner(container)
    assertContextualMicrocopy('Abrindo esta dor')
  })

  it('B16b-7b: faixa comunicante role=status com 3 dots', () => {
    const { container } = render(<AppDoresIdLoading />)
    assertStatusRegion(container)
  })

  it('B16b-7c: blocos skeleton de descrição (4 linhas ubm-sk)', () => {
    const { container } = render(<AppDoresIdLoading />)
    assertSkeletonBlocks(container, 4)
  })
})
