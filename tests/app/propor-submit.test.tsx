/**
 * T-O3.1 — /propor submit real (fecha o e2e da landing)
 * TDD RED: validação de e-mail corporativo (CA23), botão desabilitado sem empresa/consent (CA2/CA3 UI),
 * loader comunicante, tela de confirmação após sucesso.
 *
 * RN16/RN25/CA27: elo-1 — anônimo + Enviar → salva draft completo + dispara OAuth (não mostra erro de empresa).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

const { submeterMock, submeterAnonMock } = vi.hoisted(() => ({
  submeterMock: vi.fn(),
  submeterAnonMock: vi.fn(),
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDorLanding: (...args: unknown[]) => submeterMock(...args),
  // T-AN12: caminho anônimo usa submeterDorLandingAnon → retorna dorId
  submeterDorLandingAnon: (...args: unknown[]) => submeterAnonMock(...args),
  reclamarDor: vi.fn(),
  submeterDor: vi.fn(),
  moderarDor: vi.fn(),
}))

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([{ id: '1', nome: 'Empresa Teste' }]),
  obterOuCriarEmpresa: vi.fn().mockResolvedValue({ id: '1', nome: 'Empresa Teste' }),
}))

// Mock do supabase/client — comportamento determinístico em testes
const { signInWithOAuthMock, getUserMock } = vi.hoisted(() => ({
  signInWithOAuthMock: vi.fn().mockResolvedValue({ error: null }),
  getUserMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signInWithOAuth: signInWithOAuthMock,
      getUser: getUserMock,
    },
  }),
  temSupabaseNoCliente: vi.fn().mockReturnValue(true),
}))

import { ProporSubmitForm } from '@/components/propor/ProporSubmitForm'

// Default global: usuário COM sessão (não interfere nos testes anon do Elo-1 que sobrescrevem)
beforeEach(() => {
  getUserMock.mockResolvedValue({ data: { user: { id: 'uid-default' } }, error: null })
})

describe('ProporSubmitForm — T6 (submit real)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submeterMock.mockResolvedValue({ ok: true, dorId: 'dor-123' })
    // Sessão presente por padrão neste describe (fluxo logado)
    getUserMock.mockResolvedValue({ data: { user: { id: 'uid-default' } }, error: null })
  })

  it('renderiza o wizard com o primeiro passo (campo de e-mail corporativo)', () => {
    render(<ProporSubmitForm />)
    // Primeiro passo: campo de e-mail corporativo
    expect(screen.getByPlaceholderText(/voce@suaempresa/i)).toBeInTheDocument()
  })

  it('rejeita e-mail de provedor genérico (CA23 — @gmail)', async () => {
    const user = userEvent.setup()
    render(<ProporSubmitForm />)
    const emailInput = screen.getByPlaceholderText(/voce@suaempresa/i)
    await user.type(emailInput, 'joao@gmail.com')
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() =>
      expect(screen.getByText(/e-mail corporativo da sua empresa/i)).toBeInTheDocument()
    )
  })

  it('rejeita e-mail @hotmail.com (CA23)', async () => {
    const user = userEvent.setup()
    render(<ProporSubmitForm />)
    const emailInput = screen.getByPlaceholderText(/voce@suaempresa/i)
    await user.type(emailInput, 'joao@hotmail.com')
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() =>
      expect(screen.getByText(/e-mail corporativo da sua empresa/i)).toBeInTheDocument()
    )
  })

  it('aceita e-mail corporativo e avança (botão Continuar habilitado com @)', async () => {
    const user = userEvent.setup()
    render(<ProporSubmitForm />)
    const emailInput = screen.getByPlaceholderText(/voce@suaempresa/i)
    await user.type(emailInput, 'joao@empresa.com.br')
    // Botão deve estar habilitado (email contém '@')
    const btn = screen.getByRole('button', { name: /continuar/i })
    expect(btn).not.toBeDisabled()
  })

  it('botão Enviar fica desabilitado sem empresa selecionada (CA2 UI)', () => {
    // Vai direto para o passo de submit sem empresa
    render(<ProporSubmitForm initialStep="submit" />)
    const btn = screen.getByRole('button', { name: /enviar/i })
    expect(btn).toBeDisabled()
  })

  it('botão Enviar fica desabilitado sem consentimento (CA3 UI)', () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor teste com mais de 20 chars"
      />
    )
    const btn = screen.getByRole('button', { name: /enviar/i })
    expect(btn).toBeDisabled()
  })

  it('exibe loader comunicante ao submeter (design T6 — role="status")', async () => {
    submeterMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, dorId: 'dor-1' }), 200))
    )
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor teste com mais de 20 chars"
        consentido
      />
    )
    const btn = screen.getByRole('button', { name: /enviar/i })
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
  })

  it('exibe tela de confirmação após sucesso com instrução de verificar e-mail (CA21)', async () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor teste com mais de 20 chars"
        consentido
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() =>
      expect(screen.getByText(/em moderação/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/verificar/i)).toBeInTheDocument()
  })

  it('exibe mensagem de erro PT-BR quando action falha', async () => {
    submeterMock.mockResolvedValue({
      ok: false,
      error: 'Não foi possível enviar agora. Tente novamente.',
    })
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor teste com mais de 20 chars"
        consentido
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() =>
      expect(screen.getByText(/não foi possível enviar/i)).toBeInTheDocument()
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RN16/RN25/CA27 — Elo 1: usuário ANÔNIMO clica Enviar → salva draft + OAuth
// ─────────────────────────────────────────────────────────────────────────────

// localStorage reset entre testes deste bloco
const localStore: Record<string, string> = {}
const localStorageMock = {
  getItem: (k: string) => localStore[k] ?? null,
  setItem: (k: string, v: string) => { localStore[k] = v },
  removeItem: (k: string) => { delete localStore[k] },
  clear: () => Object.keys(localStore).forEach(k => delete localStore[k]),
}

describe('ProporSubmitForm — elo-1: anônimo → OAuth (RN16/RN25/CA27)', () => {
  const originalLocalStorage = globalThis.localStorage

  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })
    // Sem sessão: getUser retorna null
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    submeterMock.mockResolvedValue({ ok: true, dorId: 'dor-123' })
    // T-AN12: caminho anônimo usa submeterDorLandingAnon → guarda dorId no cache
    submeterAnonMock.mockResolvedValue({ ok: true, dorId: 'dor-123' })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, writable: true })
  })

  it('anon + Enviar → chama signInWithOAuth com provider google (RN16)', async () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor teste com mais de 20 chars"
        consentido
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    ))
  })

  it('T-AN12: anon + Enviar → salva dorId no localStorage (chave de claim para CacheSkipGate)', async () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor teste com mais de 20 chars"
        consentido
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled())

    const rawDraft = localStorageMock.getItem('ubm:dor-draft')
    expect(rawDraft).not.toBeNull()
    const draft = JSON.parse(rawDraft!)
    // T-AN12: draft agora tem dorId (não mais descricao/consentimento — re-submissão → claim)
    expect(draft).toMatchObject({
      tipo: 'representante',
      dorId: 'dor-123',
      empresa: expect.objectContaining({ id: 'emp-1' }),
    })
    // Não contém campos de re-submissão
    expect(draft.descricao).toBeUndefined()
    expect(draft.consentimento).toBeUndefined()
  })

  it('anon + Enviar → redirectTo aponta para /auth/callback?next=/app (RN16)', async () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor teste com mais de 20 chars"
        consentido
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled())

    const callArgs = signInWithOAuthMock.mock.calls[0][0]
    expect(callArgs.options?.redirectTo).toMatch(/\/auth\/callback/)
    expect(callArgs.options?.redirectTo).toMatch(/next=/)
  })

  it('anon + Enviar → NÃO mostra "Não foi possível registrar a empresa" (UX correta)', async () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor teste com mais de 20 chars"
        consentido
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled())
    expect(screen.queryByText(/registrar a empresa/i)).not.toBeInTheDocument()
  })

  it('T-AN12: anon + Enviar → chama submeterDorLandingAnon (NÃO submeterDorLanding logado — RN16)', async () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor teste com mais de 20 chars"
        consentido
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled())
    // T-AN12: usa o caminho anônimo (submeterDorLandingAnon), nunca o logado
    expect(submeterMock).not.toHaveBeenCalled()
    expect(submeterAnonMock).toHaveBeenCalled()
  })

  it('logado + Enviar → fluxo atual (submeterDorLanding) intacto (RN16 não-regressão)', async () => {
    // Com sessão: getUser retorna user
    getUserMock.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null })
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor teste com mais de 20 chars"
        consentido
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(submeterMock).toHaveBeenCalled())
    expect(signInWithOAuthMock).not.toHaveBeenCalled()
  })
})
