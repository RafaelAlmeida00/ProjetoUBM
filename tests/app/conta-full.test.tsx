/**
 * /app/conta — perfil. A UI de verificação por e-mail foi REMOVIDA: o login Google
 * já verifica a conta (decisão $0/sem domínio — migração 0045, decisions.log 2026-06-11).
 * Estes testes provam o novo comportamento E a ausência intencional da UI antiga.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/actions/perfil', () => ({
  getPerfilAction: vi.fn().mockResolvedValue({
    nome_publico: 'Rafael Teste',
    verificado: true,
    ranking_optin: false,
  }),
}))

import ContaPage from '@/app/app/conta/page'

describe('ContaPage — /app/conta', () => {
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
})
