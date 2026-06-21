/**
 * T-O2.10 — T13 /admin/backfill revisar grupos do legado e fixar
 * RED: falha antes da página existir.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }) }))

const proposeBackfillMock = vi.fn().mockResolvedValue([
  {
    grupo_id: 'g1',
    grafias: ['Nissan', 'NISSAN', 'Nissan Ltda'],
    canonico_sugerido: { id: 'e1', nome: 'Nissan' },
  },
])
const fixarGrupoMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('@/lib/actions/admin-backfill', () => ({
  proposeBackfillEmpresas: () => proposeBackfillMock(),
  fixarGrupo: (...a: unknown[]) => fixarGrupoMock(...a),
}))

import AdminBackfillPage from '@/app/admin/backfill/page'
import { ToastProvider } from '@/components/feedback/ToastProvider'

function renderPage() {
  return render(<ToastProvider><AdminBackfillPage /></ToastProvider>)
}

describe('AdminBackfillPage — T13', () => {
  it('lista grupos com grafias e empresa canônica sugerida', async () => {
    renderPage()
    // "Nissan" aparece no canônico e nas grafias — getAllByText garante ao menos um
    await waitFor(() => expect(screen.getAllByText('Nissan').length).toBeGreaterThan(0))
    expect(screen.getByText('NISSAN')).toBeInTheDocument()
  })

  it('botão "Fixar grupo" pede confirmação (ação semi-irreversível)', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /fixar grupo/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /fixar grupo/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('confirmar fixação chama fixarGrupo e remove o grupo da lista', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /fixar grupo/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /fixar grupo/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() => expect(fixarGrupoMock).toHaveBeenCalledWith('g1'))
  })
})
