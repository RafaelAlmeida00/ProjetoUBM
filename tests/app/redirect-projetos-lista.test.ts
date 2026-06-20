/**
 * 009 T3 — /app/projetos (lista) vira redirect para /app/dores.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

import ProjetosListaPage from '@/app/app/projetos/page'

beforeEach(() => redirectMock.mockClear())

describe('redirect /app/projetos lista (009 T3)', () => {
  it('redireciona para /app/dores', () => {
    ProjetosListaPage()
    expect(redirectMock).toHaveBeenCalledWith('/app/dores')
  })
})
