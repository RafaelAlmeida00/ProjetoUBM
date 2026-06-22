import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PainelPessoal } from '@/components/analytics/PainelPessoal'

const dadosMock = {
  minhas_dores_publicadas: 3,
  projetos_membro_execucao: 1,
  projetos_membro_finalizados: 2,
  minhas_tarefas_abertas: 4,
}

// CT-05: KPIs do painel pessoal SEM FrescorBadge (Velocidade A)
describe('PainelPessoal', () => {
  it('CT-05: renderiza os KPIs sem FrescorBadge', () => {
    const { container } = render(<PainelPessoal dados={dadosMock} />)
    // Deve mostrar os números (getAllByText pois '3' pode aparecer múltiplas vezes)
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    expect(screen.getByText('4')).toBeInTheDocument()
    // NÃO deve ter carimbo (sem .ubm-data-stamp)
    expect(container.querySelector('.ubm-data-stamp')).not.toBeInTheDocument()
    // NÃO deve ter role="status" (FrescorBadge)
    expect(container.querySelector('[role="status"]')).not.toBeInTheDocument()
  })

  it('CT-05: renderiza estado vazio quando dados são null', () => {
    render(<PainelPessoal dados={null} />)
    expect(screen.getByText(/Seu painel começa aqui/i)).toBeInTheDocument()
  })

  it('renderiza rótulos dos KPIs', () => {
    render(<PainelPessoal dados={dadosMock} />)
    expect(screen.getByText(/Minhas dores publicadas/i)).toBeInTheDocument()
    expect(screen.getByText(/Minhas tarefas abertas/i)).toBeInTheDocument()
  })
})
