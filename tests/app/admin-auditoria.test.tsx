/**
 * T-O2.8 — T11 /admin/auditoria leitura do log (ler_audit)
 * RED: falha antes da página existir.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }) }))

const lerAuditMock = vi.fn().mockResolvedValue([
  {
    id: 'log1',
    op: 'INSERT',
    tabela: 'dor',
    ator: 'user@ubm.br',
    timestamp: '2026-06-07T10:00:00Z',
    old: null,
    new: { status: 'rascunho' },
  },
])

vi.mock('@/lib/actions/admin-auditoria', () => ({
  lerAudit: () => lerAuditMock(),
}))

import AdminAuditoriaPage from '@/app/admin/auditoria/page'

describe('AdminAuditoriaPage — T11', () => {
  it('renderiza a trilha de auditoria com op/tabela/ator', async () => {
    render(<AdminAuditoriaPage />)
    await waitFor(() => expect(screen.getByText('INSERT')).toBeInTheDocument())
    expect(screen.getByText('dor')).toBeInTheDocument()
    expect(screen.getByText('user@ubm.br')).toBeInTheDocument()
  })

  it('op tem texto visível (não só cor)', async () => {
    render(<AdminAuditoriaPage />)
    await waitFor(() => {
      const op = screen.getByText('INSERT')
      expect(op).toBeInTheDocument()
    })
  })

  it('expandir linha mostra o JSON old/new (aria-expanded)', async () => {
    render(<AdminAuditoriaPage />)
    await waitFor(() => expect(screen.getByText('INSERT')).toBeInTheDocument())
    const expandBtn = screen.getByRole('button', { name: /expandir/i })
    fireEvent.click(expandBtn)
    await waitFor(() => expect(expandBtn).toHaveAttribute('aria-expanded', 'true'))
  })
})
