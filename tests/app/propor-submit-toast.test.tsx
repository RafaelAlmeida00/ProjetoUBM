/**
 * Domínio C — toast wiring em ProporSubmitForm (só-erro)
 * Matriz (design-feedback.md §3.2):
 *   submeterDorLanding/Anon erro → toast.erro("Não foi possível enviar sua proposta. Tente novamente.")
 *   Sucesso → redireciona (OTP / confirmação), NÃO dispara toast de sucesso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

// ── Toast spies ────────────────────────────────────────────────────────────────
const toastSucesso = vi.fn()
const toastErro = vi.fn()

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: toastSucesso, erro: toastErro, info: vi.fn(), dispensar: vi.fn() }),
}))

// ── Action mocks ───────────────────────────────────────────────────────────────
const { submeterMock, submeterAnonMock } = vi.hoisted(() => ({
  submeterMock: vi.fn(),
  submeterAnonMock: vi.fn(),
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDorLanding: (...args: unknown[]) => submeterMock(...args),
  submeterDorLandingAnon: (...args: unknown[]) => submeterAnonMock(...args),
  reclamarDor: vi.fn(),
  submeterDor: vi.fn(),
  moderarDor: vi.fn(),
}))

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([{ id: 'emp-1', nome: 'Empresa Teste' }]),
  obterOuCriarEmpresa: vi.fn().mockResolvedValue({ ok: true, empresa: { id: 'emp-1', nome: 'Empresa Teste' } }),
}))

const { getUserMock, signInWithOAuthMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  signInWithOAuthMock: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser: getUserMock, signInWithOAuth: signInWithOAuthMock },
  }),
  temSupabaseNoCliente: vi.fn().mockReturnValue(true),
}))

import { ProporSubmitForm } from '@/components/propor/ProporSubmitForm'

// Helper: preenche o wizard até o passo de submit usando props de atalho
// initialStep='submit' + dados pré-preenchidos (evita clicar em 4 passos)
async function renderPronte() {
  render(
    <ProporSubmitForm
      initialStep="submit"
      empresaId="emp-1"
      empresaNome="Empresa Teste"
      descricao="Precisamos de ajuda com automação de processos industriais."
      consentido={true}
    />,
  )
}

beforeEach(() => {
  toastSucesso.mockClear()
  toastErro.mockClear()
  submeterMock.mockReset()
  submeterAnonMock.mockReset()
  signInWithOAuthMock.mockReset()
  // Padrão: usuário com sessão (fluxo logado)
  getUserMock.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null })
})

describe('ProporSubmitForm — toast: só-erro (submeterDorLanding logado)', () => {
  it('erro na action → toast.erro com mensagem da action', async () => {
    submeterMock.mockResolvedValue({ ok: false, error: 'Empresa não encontrada.' })
    const user = userEvent.setup()
    await renderPronte()

    await user.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() =>
      expect(toastErro).toHaveBeenCalledWith('Empresa não encontrada.'),
    )
  })

  it('erro com mensagem vazia → toast.erro com copy padrão', async () => {
    submeterMock.mockResolvedValue({ ok: false, error: '' })
    const user = userEvent.setup()
    await renderPronte()

    await user.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() =>
      expect(toastErro).toHaveBeenCalledWith(
        expect.stringMatching(/não foi possível enviar sua proposta/i),
      ),
    )
  })

  it('sucesso (logado) → NÃO dispara toast.sucesso (navegação é o feedback)', async () => {
    submeterMock.mockResolvedValue({ ok: true, dorId: 'dor-nova' })
    const user = userEvent.setup()
    await renderPronte()

    await user.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() =>
      // A tela de confirmação aparece — isso é o feedback de sucesso
      expect(screen.getByText(/recebemos sua dor/i)).toBeInTheDocument(),
    )
    expect(toastSucesso).not.toHaveBeenCalled()
  })
})

describe('ProporSubmitForm — toast: só-erro (submeterDorLandingAnon)', () => {
  beforeEach(() => {
    // Usuário sem sessão → caminho anônimo
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
  })

  it('erro na action anon → toast.erro com mensagem da action', async () => {
    submeterAnonMock.mockResolvedValue({ ok: false, error: 'Serviço indisponível.' })
    const user = userEvent.setup()
    await renderPronte()

    await user.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() =>
      expect(toastErro).toHaveBeenCalledWith('Serviço indisponível.'),
    )
  })

  it('sucesso anon → NÃO dispara toast.sucesso (redireciona para OAuth)', async () => {
    submeterAnonMock.mockResolvedValue({ ok: true, dorId: 'dor-anon', claimToken: 'tok-1' })
    signInWithOAuthMock.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    await renderPronte()

    await user.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled())
    expect(toastSucesso).not.toHaveBeenCalled()
  })
})
