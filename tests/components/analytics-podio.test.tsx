import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PodioRanking } from '@/components/analytics/PodioRanking'
import { OutrosNeutro } from '@/components/analytics/OutrosNeutro'

interface ItemPodio {
  posicao: number
  nome_publico: string | null
  rotulo: string
  projetos_finalizados: number
  count: number
}

const itens: ItemPodio[] = [
  { posicao: 1, nome_publico: 'Ana Silva', rotulo: 'Aluno · Engenharia', projetos_finalizados: 5, count: 1 },
  { posicao: 2, nome_publico: null, rotulo: 'Aluno · Computação', projetos_finalizados: 3, count: 1 },
  { posicao: 3, nome_publico: 'Carlos', rotulo: 'Coordenador', projetos_finalizados: 2, count: 1 },
]

// CT-03: pódio — sem PII quando sem nome_publico; grupo suprimido → "Outros (N)"
describe('PodioRanking', () => {
  it('CT-03: renderiza lista ordenada com posições', () => {
    render(<PodioRanking itens={itens} titulo="ALUNOS" />)
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('#01')).toBeInTheDocument()
    expect(screen.getByText('#02')).toBeInTheDocument()
  })

  it('CT-03: usa rótulo (sem PII) quando nome_publico é null', () => {
    render(<PodioRanking itens={itens} titulo="ALUNOS" />)
    // posição 2: sem nome_publico → deve mostrar o rótulo
    expect(screen.getByText('Aluno · Computação')).toBeInTheDocument()
  })

  it('CT-03: não expõe campos PII (e-mail, user_id, etc.)', () => {
    const { container } = render(<PodioRanking itens={itens} titulo="ALUNOS" />)
    // Verifica que não há nenhum elemento com conteúdo de e-mail visível
    expect(container.innerHTML).not.toMatch(/@\w+\.\w+/)
  })
})

describe('OutrosNeutro', () => {
  it('CT-03: renderiza peça "Outros (N)" quando count > 0', () => {
    render(<OutrosNeutro count={12} />)
    expect(screen.getByText(/Outros \(12\) participantes/i)).toBeInTheDocument()
  })

  it('CT-03: mostra microcopy de privacidade', () => {
    render(<OutrosNeutro count={7} />)
    expect(screen.getByText(/menos de 5 pessoas/i)).toBeInTheDocument()
  })

  it('CT-03: não renderiza quando count é 0', () => {
    const { container } = render(<OutrosNeutro count={0} />)
    expect(container.firstChild).toBeNull()
  })
})
