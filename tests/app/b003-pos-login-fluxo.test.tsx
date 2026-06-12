/**
 * B-003 task #3 — Fluxo pós-login: draft completo → CacheSkipGate → onboarding_representante.
 *
 * Documenta os cenários de retomada do draft após OAuth e o CTA "Nova dor" em /app/dores.
 *
 * RED: testa comportamentos críticos do elo anônimo→login e da vitrine autenticada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ─── Mocks compartilhados ────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => '/app/dores',
}))

const { submeterMock, submeterAnonMock } = vi.hoisted(() => ({
  submeterMock: vi.fn(),
  submeterAnonMock: vi.fn(),
}))
vi.mock('@/lib/actions/dor', () => ({
  submeterDorLanding: (...args: unknown[]) => submeterMock(...args),
  // T-AN12: novo caminho anônimo (re-submissão → claim)
  submeterDorLandingAnon: (...args: unknown[]) => submeterAnonMock(...args),
  reclamarDor: vi.fn(),
  submeterDor: vi.fn(),
  moderarDor: vi.fn(),
}))

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([{ id: 'emp-1', nome: 'Empresa Teste' }]),
  obterOuCriarEmpresa: vi.fn().mockResolvedValue({ id: 'emp-1', nome: 'Empresa Teste' }),
}))

const { signInWithOAuthMock, getUserMock } = vi.hoisted(() => ({
  signInWithOAuthMock: vi.fn().mockResolvedValue({ error: null }),
  getUserMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signInWithOAuth: signInWithOAuthMock, getUser: getUserMock },
  }),
  temSupabaseNoCliente: vi.fn().mockReturnValue(true),
}))

// ─── localStorage mock ───────────────────────────────────────────────────────

const localStore: Record<string, string> = {}
const localStorageMock = {
  getItem: (k: string) => localStore[k] ?? null,
  setItem: (k: string, v: string) => { localStore[k] = v },
  removeItem: (k: string) => { delete localStore[k] },
  clear: () => Object.keys(localStore).forEach(k => delete localStore[k]),
}

const originalLocalStorage = typeof globalThis.localStorage !== 'undefined'
  ? globalThis.localStorage
  : undefined

// ─── Imports ─────────────────────────────────────────────────────────────────

import { ProporSubmitForm } from '@/components/propor/ProporSubmitForm'
import { DoresPage } from '@/components/dores/DoresPage'

// ─────────────────────────────────────────────────────────────────────────────
// Elo 1: ProporSubmitForm anônimo → draft completo para o CacheSkipGate
// ─────────────────────────────────────────────────────────────────────────────

describe('ProporSubmitForm — draft completo para CacheSkipGate (RN25/CA27)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })
    // Anônimo: sem sessão
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    submeterMock.mockResolvedValue({ ok: true, dorId: 'dor-123' })
    // T-AN12: caminho anônimo usa submeterDorLandingAnon → retorna dorId
    submeterAnonMock.mockResolvedValue({ ok: true, dorId: 'dor-123' })
  })

  afterEach(() => {
    if (originalLocalStorage !== undefined) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
      })
    }
  })

  // T-AN12: comportamento mudou — re-submissão → claim. O draft agora guarda dorId
  // em vez dos campos completos (descricao, consentimento, etc.). O CacheSkipGate
  // usa dorId para reclamarDor() pós-login em vez de re-submeter a dor.
  // Adaptado conforme T-AN12/T-AN14 (tarefa frontend-senior, 2026-06-10).

  it('T-AN12: draft salvo no anônimo contém dorId (chave de claim para o CacheSkipGate)', async () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Precisamos resolver o problema de estoque urgente."
        consentido
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled())

    const raw = localStorageMock.getItem('ubm:dor-draft')
    expect(raw).not.toBeNull()
    const draft = JSON.parse(raw!)
    // T-AN12: o draft agora tem dorId para o claim pós-login (não mais descricao para re-submissão)
    expect(draft.dorId).toBeDefined()
    expect(typeof draft.dorId).toBe('string')
  })

  it('T-AN12: draft salvo no anônimo NÃO contém descricao (não é re-submissão)', async () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Precisamos resolver o problema de estoque urgente."
        consentido
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled())

    const raw = localStorageMock.getItem('ubm:dor-draft')
    const draft = JSON.parse(raw!)
    // T-AN12: idempotência via dorId — sem campos de re-submissão no cache
    expect(draft.descricao).toBeUndefined()
    expect(draft.consentimento).toBeUndefined()
  })

  it('T-AN12: draft salvo no anônimo tem tipo=representante (draftValido() no CacheSkipGate requer isso)', async () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor de teste com mais de 10 chars."
        consentido
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled())

    const raw = localStorageMock.getItem('ubm:dor-draft')
    const draft = JSON.parse(raw!)
    expect(draft.tipo).toBe('representante')
  })

  it('T-AN12: draft salvo no anônimo tem empresa (draftValido() no CacheSkipGate aceita id ou nome)', async () => {
    render(
      <ProporSubmitForm
        initialStep="submit"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Dor de teste com mais de 10 chars."
        consentido
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled())

    const raw = localStorageMock.getItem('ubm:dor-draft')
    const draft = JSON.parse(raw!)
    // Empresa deve ter id OU nome para passar o draftValido() do CacheSkipGate
    expect(draft.empresa?.id ?? draft.empresa?.nome).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// /app/dores — CTA "Nova dor" e estado para representante
// ─────────────────────────────────────────────────────────────────────────────

describe('DoresPage — CTA Nova dor para representante verificado (task #3)', () => {
  it('representante verificado vê link "Propor nova dor" apontando para /app/dores/nova', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={true}
        isAutenticado={true}
      />,
    )
    const cta = screen.getByRole('link', { name: /propor nova dor/i })
    expect(cta).toHaveAttribute('href', '/app/dores/nova')
  })

  it('representante NÃO verificado vê aviso de verificação, não CTA de criar dor', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={false}
        isAutenticado={true}
      />,
    )
    expect(screen.getByText(/verifique sua conta/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /propor nova dor/i })).toBeNull()
  })

  it('representante verificado com dores próprias vê aba "Minhas dores"', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[{
          id: 'd1',
          empresa_nome: 'Empresa X',
          descricao: 'Dor de teste',
          status: 'em_moderacao',
          cursos: [],
        }]}
        isRepresentante={true}
        isVerificado={true}
        isAutenticado={true}
      />,
    )
    expect(screen.getByRole('tab', { name: /minhas dores/i })).toBeInTheDocument()
  })

  it('estado vazio em Minhas dores mostra link "Propor minha primeira dor" para /app/dores/nova', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={true}
        isAutenticado={true}
      />,
    )
    // Clica na aba "Minhas dores"
    const abaMinhas = screen.getByRole('tab', { name: /minhas dores/i })
    fireEvent.click(abaMinhas)

    const link = screen.getByRole('link', { name: /propor minha primeira dor/i })
    expect(link).toHaveAttribute('href', '/app/dores/nova')
  })
})
