/**
 * 009 T6 — IndicacoesRecebidas (componente extraído, reusável vitrine+detalhe).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { IndicacoesRecebidas } from '@/components/indicacoes/IndicacoesRecebidas'
import type { Indicacao } from '@/lib/data/projetos'

const ind = (over: Partial<Indicacao>): Indicacao => ({
  id: 'i1', projeto_id: 'p1', pessoa_id: 'u1', papel_pretendido: 'aluno', mensagem: null,
  created_at: '2026-01-01T00:00:00Z', deleted_at: null, aluno_nome: 'Rafael', aluno_email: 'r@e.br', curso: 'Eng. Civil',
  ...over,
})

describe('IndicacoesRecebidas (009 T6)', () => {
  it('renderiza nome/curso/contagem/chip por grupo', () => {
    render(
      <IndicacoesRecebidas grupos={[{
        projetoId: 'p1', rotulo: 'Automação — Nissan',
        indicacoes: [ind({}), ind({ id: 'i2', papel_pretendido: 'coordenador', aluno_nome: 'Said' })],
      }]} />,
    )
    expect(screen.getByText('Automação — Nissan')).toBeInTheDocument()
    expect(screen.getByText('2 indicações')).toBeInTheDocument()
    expect(screen.getByText(/Rafael/)).toBeInTheDocument()
    expect(screen.getByText(/Said/)).toBeInTheDocument()
    expect(screen.getByText('COORDENADOR')).toBeInTheDocument()
  })

  it('grupo só com indicação inativa → "Nenhuma indicação"', () => {
    render(
      <IndicacoesRecebidas grupos={[{
        projetoId: 'p1', rotulo: 'X — Y', indicacoes: [ind({ deleted_at: '2026-01-02T00:00:00Z' })],
      }]} />,
    )
    expect(screen.getByText(/Nenhuma indicação ainda/)).toBeInTheDocument()
  })

  it('grupos=[] → não renderiza PII alguma', () => {
    const { container } = render(<IndicacoesRecebidas grupos={[]} />)
    expect(container.querySelector('.ubm-indication-nome')).toBeNull()
  })
})
