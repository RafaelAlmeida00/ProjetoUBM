/**
 * T-AN12 — ProporSubmitForm: enviar anônimo (sem login) + guardar dorId no cache.
 * RED: falha antes do comportamento anônimo estar implementado.
 *
 * Comportamento esperado:
 * - submit sem sessão chama a action anônima (submeterDorLandingAnon) e guarda dorId no localStorage
 * - e-mail genérico bloqueia o avanço (UX)
 * - sucesso redireciona ao login (/login?next=/app)
 * - NÃO re-submete (idempotência: armazena dorId, não os campos do form)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Integracao: componente usa useToast — mock do provider no teste unitario (sem feedback real).
vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: vi.fn(), erro: vi.fn(), info: vi.fn(), dispensar: vi.fn() }),
}))
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// ── Mocks de infra ──────────────────────────────────────────────────────────

const mockSubmeterDorLandingAnon = vi.fn()
const mockObterOuCriarEmpresa = vi.fn()
const mockBuscarEmpresa = vi.fn().mockResolvedValue([
  { id: 'emp-1', nome: 'Acme Ltda' },
])

vi.mock('@/lib/actions/dor', () => ({
  submeterDorLanding: vi.fn(),
  submeterDorLandingAnon: (...args: unknown[]) => mockSubmeterDorLandingAnon(...args),
  moderarDor: vi.fn(),
  submeterDor: vi.fn(),
  reclamarDor: vi.fn(),
}))

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: (...args: unknown[]) => mockBuscarEmpresa(...args),
  obterOuCriarEmpresa: (...args: unknown[]) => mockObterOuCriarEmpresa(...args),
}))

// Supabase browser client — sem sessão (anônimo)
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null })
const mockSignInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null })

vi.mock('@/lib/supabase/client', () => ({
  temSupabaseNoCliente: vi.fn(() => true),
  createSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      signInWithOAuth: mockSignInWithOAuth,
    },
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

// localStorage stub
const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((k: string) => localStorageStore[k] ?? null),
  setItem: vi.fn((k: string, v: string) => { localStorageStore[k] = v }),
  removeItem: vi.fn((k: string) => { delete localStorageStore[k] }),
  clear: vi.fn(() => { for (const k in localStorageStore) delete localStorageStore[k] }),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

import { ProporSubmitForm } from '@/components/propor/ProporSubmitForm'

/** Avança o wizard até o passo de envio */
async function preencherWizardAteEnvio(user: ReturnType<typeof userEvent.setup>) {
  // Passo 1: e-mail
  await user.type(screen.getByRole('textbox', { name: /e-mail corporativo/i }), 'fulano@empresa.com')
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }))

  // Passo 2: empresa
  await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
  await user.type(screen.getByRole('combobox'), 'Acme')
  await waitFor(() => expect(screen.getByText('Acme Ltda')).toBeInTheDocument(), { timeout: 3000 })
  fireEvent.click(screen.getByText('Acme Ltda'))
  await waitFor(() => expect(screen.getByRole('button', { name: /continuar/i })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }))

  // Passo 3: descrição
  await waitFor(() => expect(screen.getByRole('textbox', { name: /descrição da dor/i })).toBeInTheDocument())
  await user.type(screen.getByRole('textbox', { name: /descrição da dor/i }), 'Precisamos de ajuda com automação de processos operacionais')
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }))

  // Passo 4: cursos (pular)
  await waitFor(() => expect(screen.getByRole('button', { name: /continuar/i })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }))

  // Passo 5: consentimento
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('checkbox'))
}

describe('ProporSubmitForm — T-AN12 (fluxo anônimo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockSubmeterDorLandingAnon.mockResolvedValue({ ok: true, dorId: 'dor-orfa-001', claimToken: 'abc123def456' })
    mockBuscarEmpresa.mockResolvedValue([{ id: 'emp-1', nome: 'Acme Ltda' }])
  })

  it('AN12-1: submit sem sessão chama submeterDorLandingAnon (não requer login prévio)', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProporSubmitForm />)
    await preencherWizardAteEnvio(user)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    })
    await waitFor(() => expect(mockSubmeterDorLandingAnon).toHaveBeenCalled(), { timeout: 5000 })
    expect(mockSignInWithOAuth).not.toHaveBeenCalledBefore(mockSubmeterDorLandingAnon)
  }, 15000)

  it('AN12-2: sucesso armazena dorId no localStorage (não os campos do form)', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProporSubmitForm />)
    await preencherWizardAteEnvio(user)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    })
    await waitFor(() => expect(mockSubmeterDorLandingAnon).toHaveBeenCalled(), { timeout: 5000 })
    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ubm:dor-draft',
        expect.stringContaining('dor-orfa-001'),
      )
    }, { timeout: 5000 })
    // o dorId deve ser armazenado, não os campos da dor completos para re-submissão
    const stored = JSON.parse(localStorageStore['ubm:dor-draft'] ?? '{}')
    expect(stored.dorId).toBe('dor-orfa-001')
  }, 15000)

  it('AN12-3: sucesso redireciona ao login Google (/login?next=/app)', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProporSubmitForm />)
    await preencherWizardAteEnvio(user)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    })
    await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalled(), { timeout: 5000 })
    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' }),
    )
  }, 15000)

  it('AN12-4: e-mail genérico (@gmail) bloqueia o avanço (UX — não chama action)', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProporSubmitForm />)
    await user.type(screen.getByRole('textbox', { name: /e-mail corporativo/i }), 'fulano@gmail.com')
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    // permanece no passo de e-mail (erro visível)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    )
    expect(mockSubmeterDorLandingAnon).not.toHaveBeenCalled()
  }, 10000)

  it('AN12-5: NÃO re-submete — armazena dorId (não os campos) para o claim', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProporSubmitForm />)
    await preencherWizardAteEnvio(user)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    })
    await waitFor(() => expect(mockSubmeterDorLandingAnon).toHaveBeenCalledTimes(1), { timeout: 5000 })
    // a action foi chamada apenas 1x — armazena dorId, não o draft completo
    const stored = JSON.parse(localStorageStore['ubm:dor-draft'] ?? '{}')
    // NÃO deve ter descricao/cursos/consentimento (campos de re-submissão)
    expect(stored.descricao).toBeUndefined()
    expect(stored.dorId).toBe('dor-orfa-001')
  }, 15000)

  it('AN12-7: localStorage contém claimToken após submit', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProporSubmitForm />)
    await preencherWizardAteEnvio(user)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    })
    await waitFor(() => expect(mockSubmeterDorLandingAnon).toHaveBeenCalled(), { timeout: 5000 })
    await waitFor(() => {
      const stored = JSON.parse(localStorageStore['ubm:dor-draft'] ?? '{}')
      expect(stored.claimToken).toBe('abc123def456')
    }, { timeout: 5000 })
  }, 15000)

  it('AN12-6: action recebe o e-mail do form (p_email para o ramo anon da RPC)', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProporSubmitForm />)
    await preencherWizardAteEnvio(user)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    })
    await waitFor(() => expect(mockSubmeterDorLandingAnon).toHaveBeenCalled(), { timeout: 5000 })
    expect(mockSubmeterDorLandingAnon).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'fulano@empresa.com' }),
    )
  }, 15000)
})
