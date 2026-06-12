/**
 * T-D3 — cache→skip: após login, rascunho em cache popula representante e pula onboarding.
 * CA27/CA28 / RN25 / architecture D.7
 *
 * RED: falha antes da implementação do componente CacheSkipGate.
 * Elo 2 (RN25/CA27): draft com dor pendente → cria identidade + submete dor + limpa draft + mostra confirmação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
})  )

const onboardingRepresentanteMock = vi.fn().mockResolvedValue({ ok: true })
// obterOuCriarEmpresa retorna { ok: true, empresa: {...} } (contrato ObterOuCriarResult)
const obterOuCriarEmpresaMock = vi.fn().mockResolvedValue({ ok: true, empresa: { id: 'emp-1', nome: 'Nissan' } })
const { submeterDorLandingMock, reclamarDorMock } = vi.hoisted(() => ({
  submeterDorLandingMock: vi.fn(),
  reclamarDorMock: vi.fn(),
}))

vi.mock('@/lib/actions/onboarding', () => ({
  onboardingRepresentante: (...args: unknown[]) => onboardingRepresentanteMock(...args),
  onboardingAluno: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([]),
  obterOuCriarEmpresa: (...args: unknown[]) => obterOuCriarEmpresaMock(...args),
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDorLanding: (...args: unknown[]) => submeterDorLandingMock(...args),
  // T-AN12/T-AN14: novo caminho anônimo (re-submissão → claim via dorId)
  submeterDorLandingAnon: vi.fn(),
  reclamarDor: (...args: unknown[]) => reclamarDorMock(...args),
  submeterDor: vi.fn(),
  moderarDor: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

// Mock do localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

import { CacheSkipGate } from '@/components/onboarding/CacheSkipGate'

const DRAFT_KEY = 'ubm:dor-draft'

function setValidDraft() {
  localStorageMock.setItem(DRAFT_KEY, JSON.stringify({
    tipo: 'representante',
    nome: 'João Silva',
    empresa: { id: 'emp-1', nome: 'Nissan' },
    departamento: 'TI',
    cargo: 'Gerente',
  }))
}

describe('CacheSkipGate — CA27 (cache válido: skip e popula representante)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    onboardingRepresentanteMock.mockResolvedValue({ ok: true })
  })

  it('CA27-7: com draft válido + sem identidade, chama onboardingRepresentante', async () => {
    setValidDraft()
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() => expect(onboardingRepresentanteMock).toHaveBeenCalled())
  })

  it('CA27-8: após skip bem-sucedido, limpa o localStorage (ubm:dor-draft)', async () => {
    setValidDraft()
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() => expect(onboardingRepresentanteMock).toHaveBeenCalled())
    expect(localStorageMock.getItem(DRAFT_KEY)).toBeNull()
  })

  it('CA27-9: exibe feedback "já preenchemos a partir da sua proposta" após skip', async () => {
    setValidDraft()
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() =>
      expect(screen.getByText(/já preenchemos/i)).toBeInTheDocument(),
    )
  })

  it('CA27-10: skip passa empresa_id ao onboardingRepresentante (não texto livre)', async () => {
    setValidDraft()
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() => expect(onboardingRepresentanteMock).toHaveBeenCalled())
    const args = onboardingRepresentanteMock.mock.calls[0]?.[0] as { empresaId: string }
    expect(args.empresaId).toBe('emp-1')
  })
})

describe('CacheSkipGate — CA27 (draft com empresa apenas nome → resolve antes)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    onboardingRepresentanteMock.mockResolvedValue({ ok: true })
    // Formato correto: { ok: true, empresa: { id, nome } }
    obterOuCriarEmpresaMock.mockResolvedValue({ ok: true, empresa: { id: 'emp-2', nome: 'NameOnly Corp' } })
  })

  it('CA27-11: draft com empresa.nome (sem id) → chama obterOuCriarEmpresa antes de onboardingRepresentante', async () => {
    localStorageMock.setItem(DRAFT_KEY, JSON.stringify({
      tipo: 'representante',
      nome: 'Maria',
      empresa: { nome: 'NameOnly Corp' }, // sem id
      departamento: 'Vendas',
      cargo: 'Gerente',
    }))
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() => expect(obterOuCriarEmpresaMock).toHaveBeenCalledWith('NameOnly Corp'))
    await waitFor(() => expect(onboardingRepresentanteMock).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 'emp-2' }),
    ))
  })
})

describe('CacheSkipGate — CA28 (fallback: sem cache ou inválido)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('CA28-1: sem cache → NÃO chama onboardingRepresentante → renderiza children (onboarding manual)', async () => {
    render(<CacheSkipGate semIdentidade><span data-testid="onboarding-manual">onboarding</span></CacheSkipGate>)
    // Não chama o skip
    await waitFor(() => {
      expect(onboardingRepresentanteMock).not.toHaveBeenCalled()
    })
    expect(screen.getByTestId('onboarding-manual')).toBeInTheDocument()
  })

  it('CA28-2: draft sem empresa → fallback ao onboarding manual', async () => {
    localStorageMock.setItem(DRAFT_KEY, JSON.stringify({
      tipo: 'representante',
      nome: 'X',
      // sem empresa
    }))
    render(<CacheSkipGate semIdentidade><span data-testid="manual">manual</span></CacheSkipGate>)
    await waitFor(() => expect(onboardingRepresentanteMock).not.toHaveBeenCalled())
    expect(screen.getByTestId('manual')).toBeInTheDocument()
  })

  it('CA28-3: draft com tipo != representante → fallback', async () => {
    localStorageMock.setItem(DRAFT_KEY, JSON.stringify({
      tipo: 'aluno',
      nome: 'Y',
    }))
    render(<CacheSkipGate semIdentidade><span data-testid="manual">manual</span></CacheSkipGate>)
    await waitFor(() => expect(onboardingRepresentanteMock).not.toHaveBeenCalled())
    expect(screen.getByTestId('manual')).toBeInTheDocument()
  })

  it('CA28-4: com identidade já existente (semIdentidade=false) → NÃO faz skip', async () => {
    setValidDraft()
    render(<CacheSkipGate semIdentidade={false}><span data-testid="noop">noop</span></CacheSkipGate>)
    await waitFor(() => expect(onboardingRepresentanteMock).not.toHaveBeenCalled())
    expect(screen.getByTestId('noop')).toBeInTheDocument()
  })

  it('CA28-5: se RPC falha → cache NÃO é limpo (preserva pré-preenchimento)', async () => {
    setValidDraft()
    onboardingRepresentanteMock.mockResolvedValue({ ok: false, error: 'Erro de RPC' })
    render(<CacheSkipGate semIdentidade><span data-testid="fallback">fallback</span></CacheSkipGate>)
    await waitFor(() => expect(screen.getByTestId('fallback')).toBeInTheDocument())
    // Cache preservado para pré-preenchimento do onboarding manual
    expect(localStorageMock.getItem(DRAFT_KEY)).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Elo 2 — T-AN14/CA27: draft com dorId → claim pós-login (re-submissão → claim)
// Comportamento mudou em T-AN12/T-AN14: agora usa reclamarDor(dorId) em vez de
// submeterDorLanding(campos). O draft guarda dorId (não descricao/consentimento).
// ─────────────────────────────────────────────────────────────────────────────

function setDraftComDorId(override?: Partial<Record<string, unknown>>) {
  localStorageMock.setItem(DRAFT_KEY, JSON.stringify({
    tipo: 'representante',
    nome: 'Ana Lima',
    email: 'ana@empresa.com',
    empresa: { id: 'emp-1', nome: 'Nissan' },
    // T-AN14: dorId é a chave de claim (não mais descricao/consentimento para re-submissão)
    dorId: 'dor-auto-1',
    claimToken: 'token-hex-64-char',
    ...override,
  }))
}

describe('CacheSkipGate — Elo 2 (T-AN14): draft com dorId → claim pós-login (RN25/CA27)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    onboardingRepresentanteMock.mockResolvedValue({ ok: true })
    obterOuCriarEmpresaMock.mockResolvedValue({ ok: true, empresa: { id: 'emp-1', nome: 'Nissan' } })
    reclamarDorMock.mockResolvedValue({ ok: true })
  })

  it('elo2-1: draft com dorId → chama reclamarDor (NÃO submeterDorLanding — T-AN14)', async () => {
    setDraftComDorId()
    render(<CacheSkipGate semIdentidade />)
    // T-AN14/E.3: sem empresa diferida, empresaId é undefined (terceiro arg)
    await waitFor(() => expect(reclamarDorMock).toHaveBeenCalledWith('dor-auto-1', 'token-hex-64-char', undefined))
    expect(submeterDorLandingMock).not.toHaveBeenCalled()
  })

  it('elo2-2: reclamarDor recebe o dorId do cache (CA27 — prova de posse pelo e-mail OAuth)', async () => {
    setDraftComDorId()
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() => expect(reclamarDorMock).toHaveBeenCalled())
    // T-AN14/E.3: sem empresa diferida, empresaId é undefined (terceiro arg)
    expect(reclamarDorMock).toHaveBeenCalledWith('dor-auto-1', 'token-hex-64-char', undefined)
  })

  it('elo2-3: após claim bem-sucedido, limpa o draft do localStorage (idempotência)', async () => {
    setDraftComDorId()
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() => expect(reclamarDorMock).toHaveBeenCalled())
    expect(localStorageMock.getItem(DRAFT_KEY)).toBeNull()
  })

  it('elo2-4: após claim bem-sucedido, exibe mensagem de confirmação (CA21)', async () => {
    setDraftComDorId()
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() =>
      expect(screen.getByText(/recebemos sua dor/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/moderação/i)).toBeInTheDocument()
  })

  it('elo2-5: exibe link /app/dores/{id} após claim (CA21)', async () => {
    setDraftComDorId()
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() => expect(reclamarDorMock).toHaveBeenCalled())
    const link = screen.getByRole('link', { name: /ver minha dor/i })
    expect(link).toHaveAttribute('href', '/app/dores/dor-auto-1')
  })

  it('elo2-6: draft sem dorId (só identidade) → fluxo legado (onboardingRepresentante, sem claim)', async () => {
    localStorageMock.setItem(DRAFT_KEY, JSON.stringify({
      tipo: 'representante',
      nome: 'Pedro',
      empresa: { id: 'emp-1', nome: 'Nissan' },
      // sem dorId
    }))
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() => expect(onboardingRepresentanteMock).toHaveBeenCalled())
    expect(reclamarDorMock).not.toHaveBeenCalled()
    expect(submeterDorLandingMock).not.toHaveBeenCalled()
  })

  it('elo2-7: sem draft → NÃO chama reclamarDor nem submeterDorLanding (CA28)', async () => {
    render(<CacheSkipGate semIdentidade><span data-testid="manual">manual</span></CacheSkipGate>)
    await waitFor(() => expect(screen.getByTestId('manual')).toBeInTheDocument())
    expect(reclamarDorMock).not.toHaveBeenCalled()
    expect(submeterDorLandingMock).not.toHaveBeenCalled()
  })

  it('elo2-8: se reclamarDor falha → fallback (CA28 — dor órfã permanece admin-only)', async () => {
    setDraftComDorId()
    reclamarDorMock.mockResolvedValue({ ok: false, error: 'e-mail não coincide' })
    render(<CacheSkipGate semIdentidade><span data-testid="fallback">fallback</span></CacheSkipGate>)
    await waitFor(() => expect(screen.getByTestId('fallback')).toBeInTheDocument())
  })

  it('elo2-9: draft com dorSubmetida=true mas SEM dorId → fluxo legado (compatibilidade)', async () => {
    // dorSubmetida=true é legado — sem dorId, vai para o fluxo de onboarding
    localStorageMock.setItem(DRAFT_KEY, JSON.stringify({
      tipo: 'representante',
      nome: 'Pedro',
      empresa: { id: 'emp-1', nome: 'Nissan' },
      dorSubmetida: true,
      // sem dorId
    }))
    render(<CacheSkipGate semIdentidade />)
    await waitFor(() => expect(onboardingRepresentanteMock).toHaveBeenCalled())
    expect(reclamarDorMock).not.toHaveBeenCalled()
  })
})
