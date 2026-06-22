import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VisaoGeral } from '@/components/analytics/VisaoGeral'

const dadosMock = {
  itens: [
    { curso: 'Engenharia de Software', total_projetos: 10, finalizados: 6, alunos_envolvidos: 24, taxa_finalizacao: 60 },
    { curso: 'Administração', total_projetos: 5, finalizados: 2, alunos_envolvidos: 10, taxa_finalizacao: 40 },
  ],
  atualizado_em: new Date(Date.now() - 20 * 60_000).toISOString(),
}

// CT-04: VisaoGeral — exibe FrescorBadge (Vel. B); negado → .ubm-locked
describe('VisaoGeral', () => {
  it('CT-04: renderiza FrescorBadge (Velocidade B)', () => {
    render(<VisaoGeral resultado={{ dados: dadosMock, locked: false }} />)
    // FrescorBadge deve estar presente (role="status")
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('CT-04: estado negado → mostra .ubm-locked, sem dados', () => {
    const { container } = render(
      <VisaoGeral resultado={{ dados: null, locked: true }} />
    )
    expect(container.querySelector('.ubm-locked')).toBeInTheDocument()
    // Não deve mostrar nenhuma tabela/dado
    expect(container.querySelector('table')).not.toBeInTheDocument()
  })

  it('renderiza dados por curso', () => {
    render(<VisaoGeral resultado={{ dados: dadosMock, locked: false }} />)
    expect(screen.getByText('Engenharia de Software')).toBeInTheDocument()
    expect(screen.getByText('Administração')).toBeInTheDocument()
  })

  it('renderiza estado de erro sem dado parcial', () => {
    render(<VisaoGeral resultado={{ dados: null, locked: false, erro: true }} />)
    expect(screen.getByText(/Não conseguimos carregar/i)).toBeInTheDocument()
  })
})
