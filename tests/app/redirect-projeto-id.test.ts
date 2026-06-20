/**
 * 009 T17 — /app/projetos/[id] vira stub: redireciona para /app/dores/<dor_id> (lookup
 * reverso via obterDorDoProjeto). Projeto inexistente/soft-deleted/sem-acesso → notFound()
 * GENÉRICO — resposta idêntica nos 3 casos (sem oráculo de existência: RN13/CA5/CA6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { redirectMock, notFoundMock, obterDorDoProjetoMock } = vi.hoisted(() => ({
  // redirect/notFound do Next LANÇAM para abortar a render — espelhamos com sentinelas.
  redirectMock: vi.fn((url: string) => { throw new Error(`__REDIRECT__:${url}`) }),
  notFoundMock: vi.fn(() => { throw new Error('__NOTFOUND__') }),
  obterDorDoProjetoMock: vi.fn(),
}))
vi.mock('next/navigation', () => ({ redirect: redirectMock, notFound: notFoundMock }))
vi.mock('@/lib/data/dores', () => ({ obterDorDoProjeto: obterDorDoProjetoMock }))

import ProjetoDetalhePage from '@/app/app/projetos/[id]/page'

beforeEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
  obterDorDoProjetoMock.mockReset()
})

describe('redirect /app/projetos/[id] → /app/dores/<dor_id> (009 T17)', () => {
  it('projeto válido+visível → redirect(/app/dores/<dor_id>)', async () => {
    obterDorDoProjetoMock.mockResolvedValue('dor-9')
    await expect(ProjetoDetalhePage({ params: Promise.resolve({ id: 'proj-1' }) }))
      .rejects.toThrow('__REDIRECT__:/app/dores/dor-9')
    expect(obterDorDoProjetoMock).toHaveBeenCalledWith('proj-1')
    expect(redirectMock).toHaveBeenCalledWith('/app/dores/dor-9')
    expect(notFoundMock).not.toHaveBeenCalled()
  })

  it('projeto inexistente/soft-deleted/sem-acesso (null) → notFound() genérico, sem redirect', async () => {
    obterDorDoProjetoMock.mockResolvedValue(null)
    await expect(ProjetoDetalhePage({ params: Promise.resolve({ id: 'proj-x' }) }))
      .rejects.toThrow('__NOTFOUND__')
    expect(notFoundMock).toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
