/**
 * B5 — /app/indicacoes "Projetos disponíveis": cards com empresa + descrição da dor + cursos + navegação.
 * RED: falha até o RSC enriquecer projetos com dor→empresa e renderizar DorCardItem canônico.
 *
 * Estratégia: como a page.tsx é RSC (não renderizável diretamente no vitest), testamos:
 *   (1) o componente de card canônico (ProjetoIndicacaoCard) que a page passa os dados
 *   (2) a lógica de enriquecimento pura (função que mapeia projeto+dor+empresa → card)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/indicacoes',
}))

// Mock do ToastProvider: ProjetoIndicacaoCard -> MeIndicarSlot usa useToast()
vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: vi.fn(), erro: vi.fn(), info: vi.fn(), dispensar: vi.fn() }),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockIndicar = vi.fn().mockResolvedValue({ ok: true })
const mockRetirar = vi.fn().mockResolvedValue({ ok: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockIndicar.mockResolvedValue({ ok: true })
  mockRetirar.mockResolvedValue({ ok: true })
})

// ── (1) ProjetoIndicacaoCard — card canônico para /app/indicacoes ─────────

describe('B5 — ProjetoIndicacaoCard', () => {
  it('ProjetoIndicacaoCard existe e pode ser importado', async () => {
    const mod = await import('@/components/indicacoes/ProjetoIndicacaoCard')
    expect(mod.ProjetoIndicacaoCard).toBeDefined()
  })

  it('renderiza como <article> (não <a> raiz)', async () => {
    const { ProjetoIndicacaoCard } = await import('@/components/indicacoes/ProjetoIndicacaoCard')
    render(
      <ProjetoIndicacaoCard
        projetoId="proj-1"
        dorId="dor-1"
        empresaNome="Nissan do Brasil"
        descricao="Precisamos de ajuda com automação"
        cursos={['engenharia_de_software']}
        papelBase="aluno"
        estadoIndicacao="disponivel"
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />
    )
    expect(document.querySelector('article.ubm-dor-card')).toBeInTheDocument()
  })

  it('link do título aponta para /app/dores/[dorId]', async () => {
    const { ProjetoIndicacaoCard } = await import('@/components/indicacoes/ProjetoIndicacaoCard')
    render(
      <ProjetoIndicacaoCard
        projetoId="proj-1"
        dorId="dor-abc"
        empresaNome="Nissan do Brasil"
        descricao="Precisamos de ajuda com automação"
        cursos={[]}
        papelBase="aluno"
        estadoIndicacao="disponivel"
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />
    )
    const link = document.querySelector('a.ubm-dor-card-link')
    expect(link).toBeInTheDocument()
    expect(link?.getAttribute('href')).toContain('/app/dores/dor-abc')
  })

  it('exibe empresa, descrição e cursos', async () => {
    const { ProjetoIndicacaoCard } = await import('@/components/indicacoes/ProjetoIndicacaoCard')
    render(
      <ProjetoIndicacaoCard
        projetoId="proj-1"
        dorId="dor-1"
        empresaNome="Nissan do Brasil"
        descricao="Precisamos de ajuda com automação"
        cursos={['engenharia_de_software']}
        papelBase="aluno"
        estadoIndicacao="disponivel"
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />
    )
    expect(screen.getByText('Nissan do Brasil')).toBeInTheDocument()
    expect(screen.getByText('Precisamos de ajuda com automação')).toBeInTheDocument()
    // curso com label legível
    expect(screen.getByText(/engenharia/i)).toBeInTheDocument()
  })

  it('estado "disponivel" renderiza botão "Me indicar"', async () => {
    const { ProjetoIndicacaoCard } = await import('@/components/indicacoes/ProjetoIndicacaoCard')
    render(
      <ProjetoIndicacaoCard
        projetoId="proj-1"
        dorId="dor-1"
        empresaNome="Nissan"
        descricao="Desc"
        cursos={[]}
        papelBase="aluno"
        estadoIndicacao="disponivel"
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />
    )
    expect(screen.getByRole('button', { name: /me indicar/i })).toBeInTheDocument()
  })

  it('estado "ja_indicado" renderiza chip + botão Retirar', async () => {
    const { ProjetoIndicacaoCard } = await import('@/components/indicacoes/ProjetoIndicacaoCard')
    render(
      <ProjetoIndicacaoCard
        projetoId="proj-1"
        dorId="dor-1"
        empresaNome="Nissan"
        descricao="Desc"
        cursos={[]}
        papelBase="aluno"
        estadoIndicacao="ja_indicado"
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />
    )
    expect(screen.getByText(/você já se indicou/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retirar/i })).toBeInTheDocument()
  })

  it('estado "ja_membro" renderiza chip "VOCÊ É DA EQUIPE" sem botão', async () => {
    const { ProjetoIndicacaoCard } = await import('@/components/indicacoes/ProjetoIndicacaoCard')
    render(
      <ProjetoIndicacaoCard
        projetoId="proj-1"
        dorId="dor-1"
        empresaNome="Nissan"
        descricao="Desc"
        cursos={[]}
        papelBase="aluno"
        estadoIndicacao="ja_membro"
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />
    )
    expect(screen.getByText(/você é da equipe/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('clicar "Me indicar" chama onIndicar com projetoId e papel', async () => {
    const { ProjetoIndicacaoCard } = await import('@/components/indicacoes/ProjetoIndicacaoCard')
    render(
      <ProjetoIndicacaoCard
        projetoId="proj-xyz"
        dorId="dor-1"
        empresaNome="Nissan"
        descricao="Desc"
        cursos={[]}
        papelBase="coordenador"
        estadoIndicacao="disponivel"
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /me indicar/i }))
    await waitFor(() => {
      expect(mockIndicar).toHaveBeenCalledWith('proj-xyz', 'coordenador')
    })
  })

  it('card com cursos vazios não exibe seção de cursos', async () => {
    const { ProjetoIndicacaoCard } = await import('@/components/indicacoes/ProjetoIndicacaoCard')
    const { container } = render(
      <ProjetoIndicacaoCard
        projetoId="proj-1"
        dorId="dor-1"
        empresaNome="Nissan"
        descricao="Desc"
        cursos={[]}
        papelBase="aluno"
        estadoIndicacao="disponivel"
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />
    )
    expect(container.querySelector('.ubm-dor-card-cursos')).toBeNull()
  })
})

// ── (2) lógica de enriquecimento de projetos ──────────────────────────────

describe('B5 — enriquecerProjetosComDor (lógica pura)', () => {
  it('enriquecerProjetosComDor existe e pode ser importada', async () => {
    const mod = await import('@/lib/data/projetos')
    expect(mod.enriquecerProjetosComDor).toBeDefined()
  })

  it('combina projeto com dados da dor correspondente', async () => {
    const { enriquecerProjetosComDor } = await import('@/lib/data/projetos')
    const projetos = [{ id: 'proj-1', dor_id: 'dor-1', status: 'em_analise' }]
    const dores = [{
      id: 'dor-1',
      empresa_nome: 'Nissan',
      descricao: 'Precisamos de ajuda',
      cursos: ['engenharia_de_software'],
    }]
    const resultado = enriquecerProjetosComDor(projetos, dores)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].empresa_nome).toBe('Nissan')
    expect(resultado[0].descricao).toBe('Precisamos de ajuda')
    expect(resultado[0].cursos).toEqual(['engenharia_de_software'])
    expect(resultado[0].dorId).toBe('dor-1')
    expect(resultado[0].projetoId).toBe('proj-1')
  })

  it('projeto sem dor correspondente usa defaults (não quebra)', async () => {
    const { enriquecerProjetosComDor } = await import('@/lib/data/projetos')
    const projetos = [{ id: 'proj-1', dor_id: 'dor-sem-dados', status: 'em_analise' }]
    const resultado = enriquecerProjetosComDor(projetos, [])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].empresa_nome).toBe('')
    expect(resultado[0].descricao).toBe('')
    expect(resultado[0].cursos).toEqual([])
  })
})
