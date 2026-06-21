/**
 * T-AN15 — Fila /admin/dores: tolerar autor_id null ("lead não reclamado").
 * RED: falha antes do componente aceitar dor órfã sem quebrar.
 * SR-A6: dor órfã só aparece para admin; UX mostra "lead não reclamado".
 * A1: aprovar não publica imediatamente (pendente de claim).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ToastProvider } from '@/components/feedback/ToastProvider'

// AdminDoresPage migrou o feedback de moderação (inline → snackbar UBM via useToast).
// Provider REAL para exercer o feedback ponta-a-ponta: toast.sucesso('Aprovada. Publicará…')
// renderiza o texto que AN15-4 assegura (getByText /aprovada.*verificar/i).
const renderUI = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>)

const moderarDorMock = vi.fn()

vi.mock('@/lib/actions/dor', () => ({
  moderarDor: (...args: unknown[]) => moderarDorMock(...args),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

import { AdminDoresPage, type DorModeracaoItem } from '@/components/admin/AdminDoresPage'

const DOR_ORFA: DorModeracaoItem = {
  id: 'dor-orfa-1',
  empresa_nome: 'Empresa desconhecida',
  descricao: 'Descrição da dor enviada anonimamente.',
  status: 'em_moderacao',
  cursos: [],
  criada_em: '2026-06-10T10:00:00Z',
  aprovado_por: null,
  motivo_rejeicao: null,
  autor_id: null as unknown as string, // órfã: autor_id nulo
  autor_verificado: false,
}

const DOR_NORMAL: DorModeracaoItem = {
  id: 'dor-normal-1',
  empresa_nome: 'Acme Ltda',
  descricao: 'Problema com automação de processos.',
  status: 'em_moderacao',
  cursos: [],
  criada_em: '2026-06-10T11:00:00Z',
  aprovado_por: null,
  motivo_rejeicao: null,
  autor_id: 'user-abc',
  autor_verificado: false,
}

describe('AdminDoresPage — T-AN15 (dor órfã na fila)', () => {
  beforeEach(() => {
    moderarDorMock.mockReset()
  })

  it('AN15-1: renderiza sem quebrar com autor_id null (sem erro de coluna fantasma)', () => {
    expect(() =>
      renderUI(<AdminDoresPage doresEmModeracao={[DOR_ORFA]} isAdmin={true} />),
    ).not.toThrow()
  })

  it('AN15-2: dor órfã aparece na fila com rótulo "lead não reclamado"', () => {
    renderUI(<AdminDoresPage doresEmModeracao={[DOR_ORFA]} isAdmin={true} />)
    expect(screen.getByText(/lead não reclamado/i)).toBeInTheDocument()
  })

  it('AN15-3: dor órfã aparece na fila junto com dor normal sem quebrar', () => {
    renderUI(<AdminDoresPage doresEmModeracao={[DOR_ORFA, DOR_NORMAL]} isAdmin={true} />)
    expect(screen.getByText(/lead não reclamado/i)).toBeInTheDocument()
    expect(screen.getByText('Acme Ltda')).toBeInTheDocument()
  })

  it('AN15-4: aprovar dor órfã exibe toast "Aprovada. Vai ao ar assim que o autor verificar" (A1 — NÃO publica imediatamente)', async () => {
    moderarDorMock.mockResolvedValue({ ok: true })
    renderUI(<AdminDoresPage doresEmModeracao={[DOR_ORFA]} isAdmin={true} />)
    // clica na dor para abrir o detalhe
    fireEvent.click(screen.getByText(/Descrição da dor/i))
    // clica em Aprovar
    const btnAprovar = screen.getByRole('button', { name: /aprovar/i })
    fireEvent.click(btnAprovar)
    await waitFor(() =>
      expect(screen.getByText(/aprovada.*verificar/i)).toBeInTheDocument(),
    )
    // a dor não some da fila imediatamente (continua "aprovada, aguardando")
    // o toast não diz "publicada" (A1: só publica após claim+verificação)
    expect(screen.queryByText(/publicada/i)).toBeNull()
  })

  it('AN15-5: sem coluna fantasma — empresa_nome tratada mesmo quando empresa_id é null na source', () => {
    const dorSemEmpresa: DorModeracaoItem = {
      ...DOR_ORFA,
      empresa_nome: 'Empresa desconhecida',
    }
    renderUI(<AdminDoresPage doresEmModeracao={[dorSemEmpresa]} isAdmin={true} />)
    // não deve rebentar; exibe empresa_nome padrão
    expect(screen.getByText('Empresa desconhecida')).toBeInTheDocument()
  })
})
