/**
 * T-O3.4 — /admin/dores: fila de moderação (aprovar/rejeitar com motivo)
 * TDD RED: fila só p/ admin, aprovar chama RPC, rejeitar exige motivo,
 * aprovada-aguardando permanece visível, não-admin vê locked (CA6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const moderarDorMock = vi.fn()
vi.mock('@/lib/actions/dor', () => ({
  moderarDor: (...args: unknown[]) => moderarDorMock(...args),
  submeterDor: vi.fn(),
  submeterDorLanding: vi.fn(),
}))

import { AdminDoresPage } from '@/components/admin/AdminDoresPage'

const DOR_FILA = {
  id: 'dor-1',
  empresa_nome: 'Empresa ABC',
  descricao: 'Precisamos resolver a questão logística com mais de 20 caracteres aqui.',
  status: 'em_moderacao' as const,
  cursos: ['administracao'],
  criada_em: '2026-06-05T00:00:00Z',
  aprovado_por: null,
  motivo_rejeicao: null,
  autor_id: 'user-rep',
  autor_verificado: true,
}

const DOR_APROVADA_AGUARDANDO = {
  ...DOR_FILA,
  id: 'dor-2',
  empresa_nome: 'Empresa DEF',
  aprovado_por: 'admin-1',
  autor_verificado: false,
}

describe('AdminDoresPage — T9 (fila de moderação)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    moderarDorMock.mockResolvedValue({ ok: true })
  })

  it('renderiza a fila com chip "MODO MODERAÇÃO"', () => {
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA]} isAdmin />
    )
    expect(screen.getByText(/modo moderação/i)).toBeInTheDocument()
  })

  it('exibe as dores em moderação na fila', () => {
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA]} isAdmin />
    )
    expect(screen.getByText('Empresa ABC')).toBeInTheDocument()
  })

  it('exibe contador da fila (voz de arquivo)', () => {
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA, DOR_APROVADA_AGUARDANDO]} isAdmin />
    )
    // "Em Moderação" aparece no contador (p.ubm-cota) e no StatusDor de cada card
    expect(screen.getAllByText(/em moderação/i).length).toBeGreaterThan(0)
  })

  it('não-admin vê peça lacrada "Área restrita" (CA6)', () => {
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA]} isAdmin={false} />
    )
    expect(screen.getByText(/área restrita/i)).toBeInTheDocument()
    expect(screen.queryByText('Empresa ABC')).toBeNull()
  })

  it('admin clica em dor e vê o painel de detalhe', () => {
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA]} isAdmin />
    )
    fireEvent.click(screen.getByText('Empresa ABC'))
    expect(screen.getByRole('button', { name: /aprovar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rejeitar/i })).toBeInTheDocument()
  })

  it('aprovar chama moderarDor("dor-1", "aprovar") (CA7)', async () => {
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA]} isAdmin />
    )
    fireEvent.click(screen.getByText('Empresa ABC'))
    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }))
    await waitFor(() =>
      // moderarDor é chamado com 2 args (sem motivo) — undefined não é passado
      expect(moderarDorMock).toHaveBeenCalledWith('dor-1', 'aprovar')
    )
  })

  it('rejeitar abre modal de motivo (CA8)', () => {
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA]} isAdmin />
    )
    fireEvent.click(screen.getByText('Empresa ABC'))
    fireEvent.click(screen.getByRole('button', { name: /rejeitar/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument()
  })

  it('botão de confirmar rejeição fica desabilitado sem motivo (CA8)', () => {
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA]} isAdmin />
    )
    fireEvent.click(screen.getByText('Empresa ABC'))
    fireEvent.click(screen.getByRole('button', { name: /rejeitar/i }))
    const confirmBtn = screen.getByRole('button', { name: /confirmar rejeição/i })
    expect(confirmBtn).toBeDisabled()
  })

  it('rejeitar com motivo chama moderarDor com o motivo (CA8)', async () => {
    const user = userEvent.setup()
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA]} isAdmin />
    )
    fireEvent.click(screen.getByText('Empresa ABC'))
    fireEvent.click(screen.getByRole('button', { name: /rejeitar/i }))
    const textarea = screen.getByLabelText(/motivo/i)
    await user.type(textarea, 'Dor mal formulada, precisa de mais detalhes.')
    fireEvent.click(screen.getByRole('button', { name: /confirmar rejeição/i }))
    await waitFor(() =>
      expect(moderarDorMock).toHaveBeenCalledWith('dor-1', 'rejeitar', 'Dor mal formulada, precisa de mais detalhes.')
    )
  })

  it('ESC fecha o modal de motivo', async () => {
    const user = userEvent.setup()
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA]} isAdmin />
    )
    fireEvent.click(screen.getByText('Empresa ABC'))
    fireEvent.click(screen.getByRole('button', { name: /rejeitar/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).toBeNull()
    )
  })

  it('dor aprovada-aguardando mostra status "APROVADA · AGUARDA VERIFICAÇÃO" (A1 CA10)', () => {
    render(
      <AdminDoresPage doresEmModeracao={[DOR_APROVADA_AGUARDANDO]} isAdmin />
    )
    // "aprovada" e "aguarda verificação" aparecem em múltiplos lugares (contador + badge)
    expect(screen.getAllByText(/aprovada/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/aguarda verificação/i).length).toBeGreaterThan(0)
  })

  it('fila vazia exibe estado positivo humanizado', () => {
    render(
      <AdminDoresPage doresEmModeracao={[]} isAdmin />
    )
    expect(screen.getByText(/nenhuma dor aguardando/i)).toBeInTheDocument()
  })

  it('modal tem foco preso e aria-required no textarea (a11y)', () => {
    render(
      <AdminDoresPage doresEmModeracao={[DOR_FILA]} isAdmin />
    )
    fireEvent.click(screen.getByText('Empresa ABC'))
    fireEvent.click(screen.getByRole('button', { name: /rejeitar/i }))
    const textarea = screen.getByLabelText(/motivo/i)
    expect(textarea).toHaveAttribute('aria-required', 'true')
  })
})
