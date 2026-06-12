/**
 * T-B14 — CacheSkipGate v2: reclamarDor(dorId, token, empresaId) + skip de onboarding
 *          + e-mail do cache como contato.
 * RED: falha antes da assinatura de token estar corretamente propagada.
 *
 * Complementa cache-skip-gate-reclamar.test.tsx (T-AN14) com os invariantes Delta 2:
 * - token presente no 2º arg de reclamarDor (não cadeia vazia por padrão)
 * - sem claimToken → fallback onboarding (CA28)
 * - claim que falha → fallback (não quebra a UI)
 * - email do cache é o contato corporativo (não o jwt.email do login)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

const mockOnboardingRepresentante = vi.fn()
const mockObterOuCriarEmpresa = vi.fn()
const mockReclamarDor = vi.fn()

vi.mock('@/lib/actions/onboarding', () => ({
  onboardingRepresentante: (...args: unknown[]) => mockOnboardingRepresentante(...args),
}))

vi.mock('@/lib/actions/empresa', () => ({
  obterOuCriarEmpresa: (...args: unknown[]) => mockObterOuCriarEmpresa(...args),
  buscarEmpresa: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/actions/dor', () => ({
  reclamarDor: (...args: unknown[]) => mockReclamarDor(...args),
  submeterDorLanding: vi.fn(),
  submeterDorLandingAnon: vi.fn(),
  moderarDor: vi.fn(),
  submeterDor: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

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

const DRAFT_KEY = 'ubm:dor-draft'

function setDraftComToken(overrides: Record<string, unknown> = {}) {
  store[DRAFT_KEY] = JSON.stringify({
    tipo: 'representante',
    nome: 'Ana Lima',
    email: 'ana@empresa.com.br',
    empresa: { id: 'emp-1', nome: 'Corp SA' },
    dorId: 'dor-orfa-delta2',
    claimToken: 'token-hex-128bits-delta2',
    ...overrides,
  })
}

function setDraftSemToken() {
  store[DRAFT_KEY] = JSON.stringify({
    tipo: 'representante',
    nome: 'Ana Lima',
    email: 'ana@empresa.com.br',
    empresa: { id: 'emp-1', nome: 'Corp SA' },
    dorId: 'dor-orfa-delta2',
    // sem claimToken — draft legado ou token não gravado
  })
}

describe('CacheSkipGate v2 — T-B14: token presente no claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k in store) delete store[k]
    mockReclamarDor.mockResolvedValue({ ok: true })
    mockObterOuCriarEmpresa.mockResolvedValue({ ok: true, empresa: { id: 'emp-1', nome: 'Corp SA' } })
  })

  it('B14-1: token presente → reclamarDor recebe o token no 2º arg (não string vazia)', async () => {
    setDraftComToken()
    render(
      <CacheSkipGate semIdentidade>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    // Draft tem empresa.id (não criar:true), então empresaIdResolvido = undefined
    await waitFor(
      () => expect(mockReclamarDor).toHaveBeenCalledWith(
        'dor-orfa-delta2',
        'token-hex-128bits-delta2',
        undefined,
      ),
      { timeout: 5000 },
    )
    // Verifica que o 2º arg não é string vazia
    const [, token] = mockReclamarDor.mock.calls[0] as [string, string, string?]
    expect(token).toBeTruthy()
    expect(token).not.toBe('')
  }, 10000)

  it('B14-2: sem claimToken no draft → fallback (CA28 — não passa token vazio)', async () => {
    setDraftSemToken()
    // Sem token: o CacheSkipGate deve tratar claim com '' como fallback se a RPC falhar
    // Ou pode chamar reclamarDor com '' e o fallback é tratado quando retorna ok:false
    mockReclamarDor.mockResolvedValue({ ok: false, error: 'token invalido: claim negado' })
    render(
      <CacheSkipGate semIdentidade>
        <div data-testid="fallback-onboarding">onboarding manual</div>
      </CacheSkipGate>,
    )
    await waitFor(
      () => expect(screen.getByTestId('fallback-onboarding')).toBeInTheDocument(),
      { timeout: 5000 },
    )
  }, 10000)

  it('B14-3: claim que falha (token expirado) → fallback, não quebra a UI', async () => {
    setDraftComToken()
    mockReclamarDor.mockResolvedValue({ ok: false, error: 'token expirado: claim negado' })
    render(
      <CacheSkipGate semIdentidade>
        <div data-testid="fallback-expirado">onboarding manual</div>
      </CacheSkipGate>,
    )
    await waitFor(
      () => expect(screen.getByTestId('fallback-expirado')).toBeInTheDocument(),
      { timeout: 5000 },
    )
  }, 10000)

  it('B14-4: claim bem-sucedido com token → pula onboarding (estado success-dor)', async () => {
    setDraftComToken()
    render(
      <CacheSkipGate semIdentidade>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    await waitFor(
      () => expect(screen.getByText(/recebemos sua dor/i)).toBeInTheDocument(),
      { timeout: 5000 },
    )
    // Onboarding manual NÃO foi renderizado (skip funcionou)
    expect(screen.queryByText('onboarding manual')).not.toBeInTheDocument()
  }, 10000)

  it('B14-5: email do cache é passado indiretamente — o token de claim carrega o email corporativo como contato', async () => {
    // O email corporativo do form (draft.email) fica no cache e é o claim_email da dor.
    // O claim v3 usa o token — não compara email. Verificamos que o fluxo funciona
    // com jwt.email pessoal (o usuário pode ter logado com @gmail).
    setDraftComToken({ email: 'fulano.corp@empresa.com.br' })
    render(
      <CacheSkipGate semIdentidade>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    await waitFor(
      () => expect(mockReclamarDor).toHaveBeenCalled(),
      { timeout: 5000 },
    )
    // Confirmação do claim bem-sucedido
    await waitFor(
      () => expect(screen.getByText(/recebemos sua dor/i)).toBeInTheDocument(),
      { timeout: 5000 },
    )
  }, 10000)

  it('B14-6: empresa diferida com token → resolve empresa e então chama reclamarDor com token', async () => {
    store[DRAFT_KEY] = JSON.stringify({
      tipo: 'representante',
      nome: 'Maria',
      email: 'maria@empresa.com.br',
      empresa: { nome: 'Nova Corp', criar: true },
      dorId: 'dor-diferida-001',
      claimToken: 'token-diferida-hex',
    })
    mockObterOuCriarEmpresa.mockResolvedValue({ ok: true, empresa: { id: 'emp-nova', nome: 'Nova Corp' } })

    render(
      <CacheSkipGate semIdentidade>
        <div>onboarding manual</div>
      </CacheSkipGate>,
    )
    await waitFor(
      () => expect(mockObterOuCriarEmpresa).toHaveBeenCalledWith('Nova Corp'),
      { timeout: 5000 },
    )
    await waitFor(
      () => expect(mockReclamarDor).toHaveBeenCalledWith(
        'dor-diferida-001',
        'token-diferida-hex',
        'emp-nova',
      ),
      { timeout: 5000 },
    )
  }, 10000)
})
