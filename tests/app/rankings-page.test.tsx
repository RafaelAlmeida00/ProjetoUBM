import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RankingsPage from '@/app/rankings/page'

// Mock the data adapter (RSC — server-only stub in tests)
vi.mock('@/lib/data/analytics', () => ({
  obterRankingsPublicos: vi.fn(),
}))

// Mock next/dynamic to render chart components synchronously in test
vi.mock('next/dynamic', () => ({
  default: (_importFn: () => Promise<{ default: React.ComponentType }>) => {
    // Return a placeholder that renders nothing (charts aren't testable in jsdom)
    return function DynamicComponent() { return null }
  },
}))

import { obterRankingsPublicos } from '@/lib/data/analytics'

const mockRankings = {
  alunos: [
    { posicao: 1, nome_publico: 'Ana Silva', rotulo: 'Aluno · Engenharia', projetos_finalizados: 5, count: 1 },
    { posicao: 2, nome_publico: null, rotulo: 'Aluno · Computação', projetos_finalizados: 3, count: 1 },
  ],
  coordenadores: [
    { posicao: 1, nome_publico: 'Prof. João', rotulo: 'Coordenador', projetos_finalizados: 8, count: 1 },
  ],
  empresas: [
    { posicao: 1, nome_publico: null, rotulo: 'Empresa XYZ', projetos_finalizados: 6, count: 1 },
  ],
  atualizado_em: new Date(Date.now() - 10 * 60_000).toISOString(),
  outros_alunos: 7,
  outros_coordenadores: 0,
  outros_empresas: 0,
}

describe('RankingsPage', () => {
  beforeEach(() => {
    vi.mocked(obterRankingsPublicos).mockResolvedValue(mockRankings)
  })

  it('renderiza os 3 pódios com dados', async () => {
    const page = await RankingsPage()
    render(page)
    // Deve mostrar os títulos dos 3 grupos (h3 exato, não a descrição)
    expect(screen.getByRole('heading', { name: 'ALUNOS' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'COORDENADORES' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'EMPRESAS' })).toBeInTheDocument()
  })

  it('renderiza o carimbo de frescor (Velocidade B)', async () => {
    const page = await RankingsPage()
    render(page)
    // FrescorBadge must appear (Velocidade B — design §3)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renderiza "Outros (N)" para grupo suprimido', async () => {
    const page = await RankingsPage()
    render(page)
    expect(screen.getByText(/Outros \(7\) participantes/i)).toBeInTheDocument()
  })

  it('renderiza estado vazio on-brand quando não há dados', async () => {
    vi.mocked(obterRankingsPublicos).mockResolvedValue({
      alunos: [],
      coordenadores: [],
      empresas: [],
      atualizado_em: null,
      outros_alunos: 0,
      outros_coordenadores: 0,
      outros_empresas: 0,
    })
    const page = await RankingsPage()
    render(page)
    expect(screen.getByText(/Ainda estamos somando/i)).toBeInTheDocument()
  })
})
