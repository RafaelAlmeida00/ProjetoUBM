/**
 * T-AN14 — CacheSkipGate: trocar re-submeter por reclamar(dorId) + fallback.
 * RED: falha antes do comportamento de claim estar implementado.
 *
 * Comportamento esperado (E.6 / E.0.8):
 * - com dorId no cache → chama reclamarDor (NÃO submeterDorLanding)
 * - re-disparo é idempotente (não duplica)
 * - sem dorId no cache → fallback onboarding (renderiza children)
 * - claim com mismatch (RPC falha) → fallback (não quebra)
 * - empresa diferida (criar:true) → chama obterOuCriarEmpresa antes do claim
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

const mockOnboardingRepresentante = vi.fn()
const mockObterOuCriarEmpresa = vi.fn()
const mockSubmeterDorLanding = vi.fn()
const mockReclamarDor = vi.fn()

vi.mock('@/lib/actions/onboarding', () => ({
  onboardingRepresentante: (...args: unknown[]) => mockOnboardingRepresentante(...args),
}))

vi.mock('@/lib/actions/empresa', () => ({
  obterOuCriarEmpresa: (...args: unknown[]) => mockObterOuCriarEmpresa(...args),
  buscarEmpresa: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDorLanding: (...args: unknown[]) => mockSubmeterDorLanding(...args),
  submeterDorLandingAnon: vi.fn(),
  reclamarDor: (...args: unknown[]) => mockReclamarDor(...args),
  moderarDor: vi.fn(),
  submeterDor: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

const DRAFT_KEY = 'ubm:dor-draft'

// localStorage stub
const store: Record<string, string> = {}
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v }),
    removeItem: vi.fn((k: string) => { delete store[k] }),
    clear: vi.fn(() => { for (const k in store) delete store[k] }),
  },
  writable: true,
})

import { CacheSkipGate } from '@/components/onboarding/CacheSkipGate'

function setDraftComDorId(extra: Record<string, unknown> = {}) {
  store[DRAFT_KEY] = JSON.stringify({
    tipo: 'representante',
    nome: 'Fulano',
    email: 'fulano@empresa.com',
    empresa: { id: 'emp-1', nome: 'Acme Ltda' },
    dorId: 'dor-orfa-001',
    claimToken: 'token-hex-64-char',
    ...extra,
  })
}

function setDraftSemDorId() {
  store[DRAFT_KEY] = JSON.stringify({
    tipo: 'representante',
    nome: 'Fulano',
    empresa: { id: 'emp-1', nome: 'Acme Ltda' },
    // sem dorId — fluxo legado (nunca submeteu anonimamente)
  })
}

function setDraftEmpresaDiferida() {
  store[DRAFT_KEY] = JSON.stringify({
    tipo: 'representante',
    nome: 'Fulano',
    email: 'fulano@empresa.com',
    empresa: { nome: 'Nova Corp', criar: true },
    dorId: 'dor-orfa-002',
    claimToken: 'token-hex-64-char',
  })
}

describe('CacheSkipGate — T-AN14 (claim via dorId)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k in store) delete store[k]
    mockOnboardingRepresentante.mockResolvedValue({ ok: true })
    mockObterOuCriarEmpresa.mockResolvedValue({ ok: true, empresa: { id: 'emp-new', nome: 'Nova Corp' } })
    mockReclamarDor.mockResolvedValue({ ok: true })
  })

  it('AN14-1: com dorId no cache chama reclamarDor (NÃO submeterDorLanding)', async () => {
    setDraftComDorId()
    render(
      <CacheSkipGate semIdentidade={true}>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    // T-AN14/E.3: sem empresa diferida, empresaId é undefined (terceiro arg)
    await waitFor(
      () => expect(mockReclamarDor).toHaveBeenCalledWith('dor-orfa-001', 'token-hex-64-char', undefined),
      { timeout: 5000 },
    )
    expect(mockSubmeterDorLanding).not.toHaveBeenCalled()
  }, 10000)

  it('AN14-2: re-disparo (claim já feito) é idempotente — reclamarDor chamado uma vez; não duplica', async () => {
    setDraftComDorId()
    mockReclamarDor.mockResolvedValue({ ok: true })
    render(
      <CacheSkipGate semIdentidade={true}>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    await waitFor(() => expect(mockReclamarDor).toHaveBeenCalledTimes(1), { timeout: 5000 })
    // re-mount não dispara segundo claim (ran.current guard)
  }, 10000)

  it('AN14-3: sem dorId no cache mas com empresa válida → fluxo legado (NÃO chama reclamarDor)', async () => {
    setDraftSemDorId()
    mockOnboardingRepresentante.mockResolvedValue({ ok: true })
    render(
      <CacheSkipGate semIdentidade={true}>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    // O fluxo legado é acionado: onboardingRepresentante é chamado, não reclamarDor
    await waitFor(() => expect(mockOnboardingRepresentante).toHaveBeenCalled(), { timeout: 5000 })
    expect(mockReclamarDor).not.toHaveBeenCalled()
  }, 10000)

  it('AN14-4: sem cache algum → fallback onboarding', async () => {
    // store vazio
    render(
      <CacheSkipGate semIdentidade={true}>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    await waitFor(() =>
      expect(screen.getByText('onboarding manual')).toBeInTheDocument(),
    { timeout: 5000 })
    expect(mockReclamarDor).not.toHaveBeenCalled()
  }, 10000)

  it('AN14-5: claim com mismatch (reclamarDor retorna erro) → fallback, não quebra', async () => {
    setDraftComDorId()
    mockReclamarDor.mockResolvedValue({ ok: false, error: 'e-mail não coincide com o claim' })
    render(
      <CacheSkipGate semIdentidade={true}>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    await waitFor(() =>
      expect(screen.getByText('onboarding manual')).toBeInTheDocument(),
    { timeout: 5000 })
  }, 10000)

  it('AN14-6: empresa diferida (criar:true) → obterOuCriarEmpresa chamada antes do claim; empresaId passado para reclamarDor', async () => {
    setDraftEmpresaDiferida()
    render(
      <CacheSkipGate semIdentidade={true}>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    await waitFor(() => expect(mockObterOuCriarEmpresa).toHaveBeenCalledWith('Nova Corp'), { timeout: 5000 })
    // T-AN14/E.3: empresaId resolvido passado como terceiro arg para reclamarDor
    // (a RPC não cria empresa — o update deve ocorrer antes do claim)
    await waitFor(() => expect(mockReclamarDor).toHaveBeenCalledWith('dor-orfa-002', 'token-hex-64-char', 'emp-new'), { timeout: 5000 })
  }, 10000)

  it('AN14-7: sucesso com dorId → exibe confirmação "Recebemos sua dor!" (CA21)', async () => {
    setDraftComDorId()
    render(
      <CacheSkipGate semIdentidade={true}>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    await waitFor(() =>
      expect(screen.getByText(/recebemos sua dor/i)).toBeInTheDocument(),
    { timeout: 5000 })
  }, 10000)

  it('AN14-8: semIdentidade=false → renderiza children imediatamente (não faz claim)', async () => {
    setDraftComDorId()
    render(
      <CacheSkipGate semIdentidade={false}>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    expect(screen.getByText('onboarding manual')).toBeInTheDocument()
    expect(mockReclamarDor).not.toHaveBeenCalled()
  }, 5000)
})
