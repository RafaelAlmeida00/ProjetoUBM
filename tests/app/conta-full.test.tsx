/**
 * /app/conta — perfil. A UI de verificação por e-mail foi REMOVIDA: o login Google
 * já verifica a conta (decisão $0/sem domínio — migração 0045, decisions.log 2026-06-11).
 * Estes testes provam o novo comportamento E a ausência intencional da UI antiga.
 * Toast wiring: atualizarPerfil sucesso → toast.sucesso("Perfil atualizado.")
 *               atualizarPerfil erro   → toast.erro(msg)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// Mock do ToastProvider — ContaPage usa useToast(); sem o mock quebraria
const toastSucessoSpy = vi.fn()
const toastErroSpy = vi.fn()
vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: toastSucessoSpy, erro: toastErroSpy, info: vi.fn(), dispensar: vi.fn() }),
}))

const atualizarPerfilMock = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/actions/perfil', () => ({
  getPerfilAction: vi.fn().mockResolvedValue({
    nome_publico: 'Rafael Teste',
    verificado: true,
    ranking_optin: false,
  }),
  atualizarPerfil: (...args: unknown[]) => atualizarPerfilMock(...args),
}))

import ContaPage from '@/app/app/conta/page'

describe('ContaPage — /app/conta', () => {
  beforeEach(() => {
    toastSucessoSpy.mockClear()
    toastErroSpy.mockClear()
    atualizarPerfilMock.mockResolvedValue({ ok: true })
  })

  it('exibe o nome público do usuário no campo de perfil', async () => {
    render(<ContaPage />)
    await waitFor(() =>
      expect(screen.getByDisplayValue('Rafael Teste')).toBeInTheDocument(),
    )
  })

  it('exibe o opt-in de ranking', async () => {
    render(<ContaPage />)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
  })

  it('NÃO mostra mais a UI de verificação por e-mail (OAuth = verificado)', async () => {
    render(<ContaPage />)
    await waitFor(() =>
      expect(screen.getByDisplayValue('Rafael Teste')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: /reenviar e-mail/i })).toBeNull()
    expect(screen.queryByText(/verificação pendente/i)).toBeNull()
    expect(screen.queryByText(/ainda não foi verificada/i)).toBeNull()
  })

  // ── Toast wiring (feedback-padrao matriz 3.1) ──────────────────────────────

  it('toast.sucesso("Perfil atualizado.") é chamado após atualizarPerfil com sucesso', async () => {
    render(<ContaPage />)
    // Espera carregar o perfil
    await waitFor(() => expect(screen.getByDisplayValue('Rafael Teste')).toBeInTheDocument())
    // Clica Salvar
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(toastSucessoSpy).toHaveBeenCalledWith('Perfil atualizado.')
    })
  })

  it('toast.erro é chamado quando atualizarPerfil falha com mensagem da action', async () => {
    atualizarPerfilMock.mockResolvedValueOnce({ ok: false, error: 'Nome já em uso.' })
    render(<ContaPage />)
    await waitFor(() => expect(screen.getByDisplayValue('Rafael Teste')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(toastErroSpy).toHaveBeenCalledWith('Nome já em uso.')
    })
  })

  it('toast.erro usa copy padrão quando atualizarPerfil falha sem mensagem', async () => {
    atualizarPerfilMock.mockResolvedValueOnce({ ok: false })
    render(<ContaPage />)
    await waitFor(() => expect(screen.getByDisplayValue('Rafael Teste')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(toastErroSpy).toHaveBeenCalledWith('Não foi possível salvar seu perfil. Tente novamente.')
    })
  })

  it('NÃO exibe mais o elemento inline ubm-save-feedback (migrado para toast)', async () => {
    render(<ContaPage />)
    await waitFor(() => expect(screen.getByDisplayValue('Rafael Teste')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => expect(toastSucessoSpy).toHaveBeenCalled())
    // O feedback inline antigo não deve existir
    expect(document.querySelector('.ubm-save-feedback')).toBeNull()
  })
})
