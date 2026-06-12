import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string | { pathname?: string }; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : (href?.pathname ?? '#')} {...rest}>
      {children}
    </a>
  ),
}))

import ConfirmacaoPage from '@/app/confirmacao/page'
import { saveDraft, loadDraft } from '@/lib/wizard/draft'

// T3e — AC6 (confirmação) + RS15 (limpa rascunho)
describe('app/confirmacao', () => {
  it('mostra "Recebemos sua proposta" e limpa o rascunho', () => {
    saveDraft({ repNome: 'Maria' })
    render(<ConfirmacaoPage />)
    expect(screen.getByText(/recebemos sua proposta/i)).toBeInTheDocument()
    expect(loadDraft()).toBeNull()
  })
})
