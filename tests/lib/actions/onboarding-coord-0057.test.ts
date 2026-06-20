/**
 * 0057 — onboardingCoordenador: contrato novo (cursoSlugs: string[], não cursoId único)
 * RED: falha até a action aceitar p_curso_slugs (array).
 *
 * Contrato:
 *   onboardingCoordenador({ cursoSlugs: string[], nome: string })
 *   → rpc onboarding_coordenador(p_curso_slugs curso_ubm[], p_nome text)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

const authGetUserMock = vi.fn()
const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null })

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: { getUser: authGetUserMock },
    rpc: rpcMock,
  })),
}))

import { onboardingCoordenador } from '@/lib/actions/onboarding'

describe('onboardingCoordenador — 0057: multi-slug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authGetUserMock.mockResolvedValue({
      data: { user: { id: 'uid-coord', email: 'prof@ubm.br' } },
      error: null,
    })
    rpcMock.mockResolvedValue({ data: null, error: null })
  })

  it('0057-OC-1: chama rpc onboarding_coordenador com p_curso_slugs (array)', async () => {
    const result = await onboardingCoordenador({
      cursoSlugs: ['direito', 'administracao'],
      nome: 'Prof. Braga',
    })
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('onboarding_coordenador', {
      p_curso_slugs: ['direito', 'administracao'],
      p_nome: 'Prof. Braga',
    })
  })

  it('0057-OC-2: funciona com array de um único slug', async () => {
    const result = await onboardingCoordenador({
      cursoSlugs: ['direito'],
      nome: 'Prof. Silva',
    })
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('onboarding_coordenador', {
      p_curso_slugs: ['direito'],
      p_nome: 'Prof. Silva',
    })
  })

  it('0057-OC-3: retorna ok:false quando cursoSlugs está vazio', async () => {
    const result = await onboardingCoordenador({ cursoSlugs: [], nome: 'Prof. X' })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/curso/i)
  })

  it('0057-OC-4: retorna ok:false sem sessão', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const result = await onboardingCoordenador({ cursoSlugs: ['direito'], nome: 'X' })
    expect(result.ok).toBe(false)
  })

  it('0057-OC-5: retorna ok:false quando rpc retorna erro', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'curso inválido' } })
    const result = await onboardingCoordenador({ cursoSlugs: ['invalido'], nome: 'Prof. Y' })
    expect(result.ok).toBe(false)
  })

  it('0057-OC-6: NÃO usa p_curso_id (parâmetro antigo singular)', async () => {
    await onboardingCoordenador({ cursoSlugs: ['direito'], nome: 'Prof. Z' })
    const rpcArgs = rpcMock.mock.calls[0]?.[1] as Record<string, unknown> | undefined
    expect(rpcArgs).toBeDefined()
    expect(rpcArgs).not.toHaveProperty('p_curso_id')
    expect(rpcArgs).toHaveProperty('p_curso_slugs')
  })
})
