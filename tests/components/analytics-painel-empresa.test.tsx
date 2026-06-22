import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PainelEmpresa } from '@/components/analytics/PainelEmpresa'

const dadosMock = {
  dores_rascunho: 1,
  dores_em_moderacao: 2,
  dores_publicadas: 5,
  projetos_derivados: 3,
  projetos_finalizados: 1,
  total_projetos: 3,
}

// CT-05: painel empresa SEM FrescorBadge, sem nome de aluno
describe('PainelEmpresa', () => {
  it('CT-05: renderiza KPIs sem FrescorBadge (Velocidade A)', () => {
    const { container } = render(<PainelEmpresa dados={dadosMock} />)
    // Sem carimbo
    expect(container.querySelector('.ubm-data-stamp')).not.toBeInTheDocument()
    expect(container.querySelector('[role="status"]')).not.toBeInTheDocument()
  })

  it('CT-05: não renderiza nome de aluno/membro', () => {
    const { container } = render(<PainelEmpresa dados={dadosMock} />)
    // Nenhum campo de "nome" de pessoa aparece — só contagens
    expect(container.innerHTML).not.toMatch(/nome_publico|aluno_nome|membro/i)
  })

  it('renderiza contagens de dores e projetos', () => {
    render(<PainelEmpresa dados={dadosMock} />)
    expect(screen.getByText('3')).toBeInTheDocument() // projetos derivados
    expect(screen.getByText(/Projetos derivados/i)).toBeInTheDocument()
  })

  it('renderiza estado vazio quando dados são null', () => {
    render(<PainelEmpresa dados={null} />)
    expect(screen.getByText(/Sua empresa ainda não tem dores/i)).toBeInTheDocument()
  })
})
