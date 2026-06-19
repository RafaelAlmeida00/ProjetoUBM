/**
 * Fix Bug 2 — /app/notificacoes lia a coluna inexistente "lida" (DB tem `lida_em`, migration 0010).
 * O select lançava `column notificacao.lida does not exist` → catch → lista SEMPRE vazia.
 * Aqui exercitamos o fetch REAL da página (o notificacoes-005.test só testava reimplementações).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const { mockFrom, mockSelect, mockEq, mockOrder, mockLimit, getUserMock } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockOrder: vi.fn(),
  mockLimit: vi.fn(),
  getUserMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: getUserMock },
    from: mockFrom,
  }),
}))

import NotificacoesPage from '@/app/app/notificacoes/page'

const ROW_NAO_LIDA = {
  id: 'n1',
  tipo: 'dor_aprovada_curso',
  lida_em: null,
  created_at: '2026-06-01T10:00:00Z',
  payload: { evento: 'projeto_aberto', curso: 'Engenharia de Software' },
}
const ROW_LIDA = {
  id: 'n2',
  tipo: 'status_mudou',
  lida_em: '2026-06-02T10:00:00Z',
  created_at: '2026-06-02T10:00:00Z',
  payload: { evento: 'equipe_fechada', empresa: 'Nissan', projeto_id: 'proj-1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockLimit.mockResolvedValue({ data: [ROW_NAO_LIDA, ROW_LIDA], error: null })
  mockOrder.mockReturnValue({ limit: mockLimit })
  mockEq.mockReturnValue({ order: mockOrder, limit: mockLimit })
  mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder, limit: mockLimit })
  mockFrom.mockReturnValue({ select: mockSelect })
})

describe('NotificacoesPage — fetch usa a coluna real lida_em (não "lida")', () => {
  it('seleciona lida_em (coluna real), nunca a inexistente "lida"', async () => {
    const jsx = await NotificacoesPage()
    render(jsx as React.ReactElement)
    expect(mockFrom).toHaveBeenCalledWith('notificacao')
    const cols = mockSelect.mock.calls[0][0] as string
    expect(cols).toMatch(/lida_em/)
    // não pode pedir a coluna "lida" isolada — não existe no schema (erro em runtime)
    expect(cols.split(',').map((c) => c.trim())).not.toContain('lida')
  })

  it('renderiza as notificações (não cai no estado vazio)', async () => {
    const jsx = await NotificacoesPage()
    render(jsx as React.ReactElement)
    expect(screen.getByText(/abriu um projeto/i)).toBeInTheDocument()
    expect(screen.queryByText(/nada por aqui/i)).toBeNull()
  })

  it('deriva "lida" de lida_em (apenas o item com lida_em preenchido recebe --lida)', async () => {
    const jsx = await NotificacoesPage()
    const { container } = render(jsx as React.ReactElement)
    expect(container.querySelectorAll('.ubm-notif-item--lida').length).toBe(1)
  })
})
