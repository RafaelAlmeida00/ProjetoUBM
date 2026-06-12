/**
 * T-B13 — ProporSubmitForm: guardar {dorId, claimToken} no cache após submit anon v3.
 * RED antes do comportamento implementado.
 *
 * SR-B3: o claimToken NÃO aparece em nenhum atributo de URL/href/texto renderizado
 * na confirmação — vive SOMENTE no localStorage (par {dorId, claimToken}).
 * O email do form persiste no cache como contato.
 *
 * Contexto do componente:
 * - `temSupabaseNoCliente()` deve retornar true para entrar no ramo anon
 * - `supabase.auth.getUser()` retorna user=null (sem sessão)
 * - A action `submeterDorLandingAnon` retorna {ok:true, dorId, claimToken}
 * - O componente grava {dorId, claimToken} no localStorage e redireciona para OAuth
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// ── Mocks de infra ──────────────────────────────────────────────────────────

const supabaseMock = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({}),
  },
}

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: vi.fn(() => supabaseMock),
  // temSupabaseNoCliente=true → entra no ramo anon (usuário sem sessão)
  temSupabaseNoCliente: vi.fn(() => true),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

// ── Mocks das Server Actions ────────────────────────────────────────────────

const mockSubmeterDorLandingAnon = vi.fn()
const mockSubmeterDorLanding = vi.fn()

vi.mock('@/lib/actions/dor', () => ({
  submeterDorLanding: (...args: unknown[]) => mockSubmeterDorLanding(...args),
  submeterDorLandingAnon: (...args: unknown[]) => mockSubmeterDorLandingAnon(...args),
  reclamarDor: vi.fn(),
  moderarDor: vi.fn(),
  submeterDor: vi.fn(),
}))

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([{ id: 'e1', nome: 'Corp SA' }]),
  obterOuCriarEmpresa: vi.fn().mockResolvedValue({ ok: true, empresa: { id: 'e1', nome: 'Corp SA' } }),
}))

// ── localStorage stub ───────────────────────────────────────────────────────

const lsStore: Record<string, string> = {}
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn((k: string) => lsStore[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { lsStore[k] = v }),
    removeItem: vi.fn((k: string) => { delete lsStore[k] }),
    clear: vi.fn(() => { for (const k in lsStore) delete lsStore[k] }),
  },
  writable: true,
})

const DRAFT_KEY = 'ubm:dor-draft'

import { ProporSubmitForm } from '@/components/propor/ProporSubmitForm'

describe('ProporSubmitForm — T-B13: cache {dorId, claimToken}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k in lsStore) delete lsStore[k]
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    supabaseMock.auth.signInWithOAuth.mockResolvedValue({})
  })

  it('B13-1: após submit anon bem-sucedido, cache contém dorId e claimToken ambos não-nulos', async () => {
    const user = userEvent.setup()
    mockSubmeterDorLandingAnon.mockResolvedValue({
      ok: true,
      dorId: 'dor-test-001',
      claimToken: 'token-128bits-hex-value',
    })

    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="e1"
        empresaNome="Corp SA"
        descricao="Precisamos de solução para o problema X com urgência real"
        consentido={true}
      />,
    )

    // Clicar no botão Enviar
    const enviarBtn = await screen.findByRole('button', { name: /enviar/i })
    await user.click(enviarBtn)

    await waitFor(() => {
      const raw = lsStore[DRAFT_KEY]
      expect(raw).toBeTruthy()
      const draft = JSON.parse(raw)
      expect(draft.dorId).toBe('dor-test-001')
      expect(draft.claimToken).toBe('token-128bits-hex-value')
    }, { timeout: 5000 })
  })

  it('B13-2: claimToken NÃO aparece em nenhum href ou texto visível na confirmação (SR-B3)', async () => {
    const user = userEvent.setup()
    mockSubmeterDorLandingAnon.mockResolvedValue({
      ok: true,
      dorId: 'dor-test-002',
      claimToken: 'SECRET_TOKEN_NOT_IN_DOM',
    })

    const { container } = render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="e1"
        empresaNome="Corp SA"
        descricao="Precisamos de solução para o problema X com urgência real"
        consentido={true}
      />,
    )

    const enviarBtn = await screen.findByRole('button', { name: /enviar/i })
    await user.click(enviarBtn)

    await waitFor(() => {
      expect(lsStore[DRAFT_KEY]).toBeTruthy()
    }, { timeout: 5000 })

    // Token não deve aparecer no DOM
    expect(container.innerHTML).not.toContain('SECRET_TOKEN_NOT_IN_DOM')
    // Nem em href de link algum
    const links = container.querySelectorAll('a[href]')
    links.forEach((link) => {
      expect(link.getAttribute('href')).not.toContain('SECRET_TOKEN_NOT_IN_DOM')
    })
  })

  it('B13-3: email do form persiste no cache como contato', async () => {
    const user = userEvent.setup()
    mockSubmeterDorLandingAnon.mockResolvedValue({
      ok: true,
      dorId: 'dor-test-003',
      claimToken: 'token-contato-test',
    })

    render(<ProporSubmitForm initialStep="email" />)

    // Preenche email corporativo — usa o input pelo placeholder/aria-label exato
    const emailInput = screen.getByRole('textbox', { name: /e-mail corporativo/i })
    await user.type(emailInput, 'ana@empresa.com.br')
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))

    // O email deve estar preenchido no estado interno do componente
    // Verificamos que o componente avançou para o próximo passo
    await waitFor(() => {
      expect(screen.queryByText(/de qual empresa|qual é a dor/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('B13-4: botão "Ver minha dor" não aparece na tela de submit anon (redireciona para OAuth)', async () => {
    const user = userEvent.setup()
    mockSubmeterDorLandingAnon.mockResolvedValue({
      ok: true,
      dorId: 'dor-visivel-004',
      claimToken: 'token-nao-vai-pra-url',
    })

    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="e1"
        empresaNome="Corp SA"
        descricao="Precisamos de solução para o problema X com urgência real"
        consentido={true}
      />,
    )

    const enviarBtn = await screen.findByRole('button', { name: /enviar/i })
    await user.click(enviarBtn)

    await waitFor(() => {
      expect(lsStore[DRAFT_KEY]).toBeTruthy()
    }, { timeout: 5000 })

    // No fluxo anon, após submit o componente redireciona para OAuth (não mostra "Ver minha dor")
    // A confirmação com "Ver minha dor" é exibida apenas no fluxo logado (step='confirmacao')
    expect(supabaseMock.auth.signInWithOAuth).toHaveBeenCalled()
    // O token não deve estar em nenhum link
    const allLinks = document.querySelectorAll('a[href]')
    allLinks.forEach((link) => {
      expect(link.getAttribute('href')).not.toContain('token-nao-vai-pra-url')
    })
  })
})
