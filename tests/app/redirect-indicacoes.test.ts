/**
 * 009 T2 — /app/indicacoes vira redirect para /app/dores.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

import IndicacoesPage from '@/app/app/indicacoes/page'

beforeEach(() => redirectMock.mockClear())

describe('redirect /app/indicacoes (009 T2)', () => {
  it('redireciona para /app/dores', () => {
    IndicacoesPage()
    expect(redirectMock).toHaveBeenCalledWith('/app/dores')
  })
})
