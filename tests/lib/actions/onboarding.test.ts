/**
 * T-D3 — cache→skip Server Action (CA27/CA28)
 * RN25 / architecture D.7
 *
 * RED: falha antes da implementação da action onboardingRepresentante e verificarCacheESkipar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks Supabase ──────────────────────────────────────────────────────────
const rpcMock = vi.fn()
const authGetUserMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: { getUser: authGetUserMock },
    rpc: rpcMock,
    from: fromMock,
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

// ── Import após mocks ────────────────────────────────────────────────────────
import {
  onboardingRepresentante,
  onboardingAluno,
} from '@/lib/actions/onboarding'

describe('onboardingRepresentante — CA24/CA27', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'uid-1', email: 'joao.pessoal@gmail.com' } }, error: null })
    rpcMock.mockResolvedValue({ data: null, error: null })
  })

  // TRANSFORMAÇÃO T-B5 (Art. II §3): emailCorporativo migrou do jwt.email para parâmetro explícito.
  // O invariante "representante exige e-mail corporativo" é PRESERVADO — só muda a origem.

  it('CA27-1: retorna ok:true ao chamar com dados válidos (incluindo emailCorporativo)', async () => {
    const result = await onboardingRepresentante({
      empresaId: 'emp-1',
      nome: 'João Silva',
      departamento: 'TI',
      cargo: 'Gerente',
      emailCorporativo: 'joao@empresa.com.br',
    })
    expect(result.ok).toBe(true)
  })

  it('CA27-2: chama RPC onboarding_representante com os parâmetros corretos (incl. p_email_corporativo)', async () => {
    await onboardingRepresentante({
      empresaId: 'emp-abc',
      nome: 'Maria',
      departamento: 'RH',
      cargo: 'Coordenadora',
      emailCorporativo: 'maria@empresa.com.br',
    })
    expect(rpcMock).toHaveBeenCalledWith('onboarding_representante', {
      p_empresa_id: 'emp-abc',
      p_nome: 'Maria',
      p_departamento: 'RH',
      p_cargo: 'Coordenadora',
      p_email_corporativo: 'maria@empresa.com.br',
    })
  })

  it('CA27-3: retorna ok:false se não há sessão', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const result = await onboardingRepresentante({
      empresaId: 'emp-1',
      nome: 'X',
      emailCorporativo: 'x@empresa.com',
    })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/sess[aã]o|login/i)
  })

  it('CA27-4: retorna ok:false se empresaId estiver vazio', async () => {
    const result = await onboardingRepresentante({
      empresaId: '',
      nome: 'X',
      emailCorporativo: 'x@empresa.com',
    })
    expect(result.ok).toBe(false)
  })

  it('CA27-5: retorna ok:false se RPC retornar erro', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'representante exige e-mail corporativo' } })
    const result = await onboardingRepresentante({
      empresaId: 'emp-1',
      nome: 'X',
      emailCorporativo: 'x@empresa.com',
    })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBeTruthy()
  })

  it('CA27-6: departamento e cargo são opcionais (null tolerado); emailCorporativo obrigatório', async () => {
    const result = await onboardingRepresentante({
      empresaId: 'emp-1',
      nome: 'Pedro',
      emailCorporativo: 'pedro@empresa.com.br',
    })
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith(
      'onboarding_representante',
      expect.objectContaining({ p_departamento: null, p_cargo: null }),
    )
  })

  it('CA27-7: retorna ok:false se emailCorporativo ausente (T-B5 — guarda migrou do jwt.email)', async () => {
    // O invariante "representante exige e-mail corporativo" é preservado — agora no parâmetro
    const result = await onboardingRepresentante({
      empresaId: 'emp-1',
      nome: 'Teste',
      emailCorporativo: '',
    })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/e-mail corp|corporativo/i)
  })
})

describe('onboardingAluno — CA25', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'uid-2', email: 'ana@ubm.br' } }, error: null })
    rpcMock.mockResolvedValue({ data: null, error: null })
  })

  it('CA25-4: retorna ok:true ao chamar com dados válidos', async () => {
    const result = await onboardingAluno({ nome: 'Ana', cursoIds: ['curso-1'] })
    expect(result.ok).toBe(true)
  })

  it('CA25-5: chama RPC onboarding_aluno com p_curso_slugs (migração 0047 — aceita slugs de enum, não UUIDs)', async () => {
    await onboardingAluno({ nome: 'Ana', cursoIds: ['c1', 'c2'] })
    expect(rpcMock).toHaveBeenCalledWith('onboarding_aluno', {
      p_nome: 'Ana',
      p_curso_slugs: ['c1', 'c2'],
    })
  })

  it('CA25-6: aceita cursoIds vazio (cursos opcionais)', async () => {
    const result = await onboardingAluno({ nome: 'Pedro', cursoIds: [] })
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('onboarding_aluno', {
      p_nome: 'Pedro',
      p_curso_slugs: [],
    })
  })

  it('CA25-7: retorna ok:false sem sessão', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const result = await onboardingAluno({ nome: 'X', cursoIds: [] })
    expect(result.ok).toBe(false)
  })
})
