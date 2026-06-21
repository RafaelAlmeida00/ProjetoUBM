/**
 * T-O2.9 — T12 /admin/empresas duplicatas + merge/undo + lixeira
 * RED: falha antes da página existir.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }) }))

// shape plano real da RPC listar_duplicatas_possiveis(): a, nome_a, b, nome_b, sim
const listarDuplicatasMock = vi.fn().mockResolvedValue([
  { a: 'e1', nome_a: 'Nissan', b: 'e2', nome_b: 'Nissan Ltda', sim: 0.92 },
])
const mergeEmpresaMock = vi.fn().mockResolvedValue({ ok: true, log_id: 'log1' })
const desfazerMergeMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('@/lib/actions/admin-empresas', () => ({
  listarDuplicatasPosiveis: () => listarDuplicatasMock(),
  mergeEmpresa: (...a: unknown[]) => mergeEmpresaMock(...a),
  desfazerMerge: (...a: unknown[]) => desfazerMergeMock(...a),
}))

import AdminEmpresasPage from '@/app/admin/empresas/page'
import { ToastProvider } from '@/components/feedback/ToastProvider'

function renderPage() {
  return render(<ToastProvider><AdminEmpresasPage /></ToastProvider>)
}

describe('AdminEmpresasPage — T12', () => {
  it('lista possíveis duplicatas com similaridade em texto', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Nissan')).toBeInTheDocument())
    expect(screen.getByText('Nissan Ltda')).toBeInTheDocument()
    // similaridade como texto (não só cor)
    expect(screen.getByText(/92%/)).toBeInTheDocument()
  })

  it('botão merge abre modal de confirmação', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Nissan')).toBeInTheDocument())
    const mergeBtn = screen.getByRole('button', { name: /unir/i })
    fireEvent.click(mergeBtn)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('confirmar merge chama mergeEmpresa e oferece opção de desfazer via toast', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /unir/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /unir/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() => expect(mergeEmpresaMock).toHaveBeenCalled())
    // O botão "Desfazer" agora é a ação do toast global
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /desfazer/i })).toBeInTheDocument(),
    )
  })
})
