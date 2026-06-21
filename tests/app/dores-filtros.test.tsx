/**
 * 009 — Barra de filtros role-aware da vitrine /app/dores
 * RED: todos estes testes devem falhar antes da implementação.
 *
 * Cobre (spec ux-ui-filtros.md §5/§6):
 * - Filtro Curso (incl. "Minha Coordenação" só p/ coord; opções derivadas das dores)
 * - Filtro Empresa (opções derivadas)
 * - Filtro Andamento: Publicada, Em análise, Virou caso, Finalizado
 * - Filtro Participação: Indicado, Não indicado, Membro, Host (coord); ausente p/ representante
 * - AND entre dimensões
 * - Empty state com "Limpar filtros"
 * - Contagem (aria-live) + chips de filtro ativo + ✕ remove dimensão
 * - a11y: aria-label em cada select
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'

// MeIndicarSlot (via DoresPage) usa useToast() — mock obrigatorio sem provider
vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: vi.fn(), erro: vi.fn(), info: vi.fn(), dispensar: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/dores',
}))

import { DoresPage } from '@/components/dores/DoresPage'

// ---------------------------------------------------------------------------
// Fixtures de dores
// ---------------------------------------------------------------------------

const DOR_SEM_PROJETO = {
  id: 'dor-1',
  empresa_nome: 'Empresa Alpha',
  descricao: 'Desc 1',
  status: 'publicada' as const,
  cursos: ['direito'],
  publicada_em: '2026-01-01T00:00:00Z',
  projeto_id: undefined,
  projeto_status: undefined,
}

const DOR_EM_ANALISE = {
  id: 'dor-2',
  empresa_nome: 'Empresa Beta',
  descricao: 'Desc 2',
  status: 'publicada' as const,
  cursos: ['engenharia_de_software'],
  publicada_em: '2026-01-02T00:00:00Z',
  projeto_id: 'proj-a',
  projeto_status: 'em_analise',
}

const DOR_VIROU_CASO = {
  id: 'dor-3',
  empresa_nome: 'Empresa Gamma',
  descricao: 'Desc 3',
  status: 'publicada' as const,
  cursos: ['administracao'],
  publicada_em: '2026-01-03T00:00:00Z',
  projeto_id: 'proj-b',
  projeto_status: 'aprovado',
}

const DOR_FINALIZADA = {
  id: 'dor-4',
  empresa_nome: 'Empresa Alpha',  // mesma empresa que dor-1 (testa de-dup de empresa)
  descricao: 'Desc 4',
  status: 'publicada' as const,
  cursos: ['direito'],
  publicada_em: '2026-01-04T00:00:00Z',
  projeto_id: 'proj-c',
  projeto_status: 'finalizado',
}

const TODAS_DORES = [DOR_SEM_PROJETO, DOR_EM_ANALISE, DOR_VIROU_CASO, DOR_FINALIZADA]

const VINCULOS_ALUNO = {
  indicadoProjetoIds: ['proj-a'],    // indicado em proj-a (DOR_EM_ANALISE)
  membroProjetoIds: ['proj-b'],      // membro em proj-b (DOR_VIROU_CASO)
  hostProjetoIds: [],
}

const VINCULOS_COORD = {
  indicadoProjetoIds: [],
  membroProjetoIds: [],
  hostProjetoIds: ['proj-b'],        // host de proj-b (DOR_VIROU_CASO)
}

// ---------------------------------------------------------------------------
// § A — Barra aparece / não aparece
// ---------------------------------------------------------------------------

describe('Filtros — renderização condicional', () => {
  it('NÃO renderiza barra de filtros quando doresPublicadas está vazia', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(container.querySelector('.ubm-filtros')).toBeNull()
  })

  it('renderiza barra de filtros quando há dores publicadas', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(container.querySelector('.ubm-filtros')).not.toBeNull()
  })

  it('NÃO renderiza barra na aba "Minhas dores"', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[DOR_SEM_PROJETO]}
        isRepresentante={true}
        isVerificado={true}
      />
    )
    // Muda para aba Minhas dores
    const btnMinhas = screen.getByRole('tab', { name: /minhas dores/i })
    fireEvent.click(btnMinhas)
    expect(container.querySelector('.ubm-filtros')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// § B — Filtro Curso
// ---------------------------------------------------------------------------

describe('Filtros — Curso', () => {
  it('select "Filtrar por curso" tem opção Todos (default)', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por curso/i })
    expect(select).toBeInTheDocument()
    expect(within(select as HTMLElement).getByRole('option', { name: /todos/i })).toBeInTheDocument()
  })

  it('opções de curso são derivadas das dores (só cursos presentes)', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por curso/i })
    // Dores têm: direito, engenharia_de_software, administracao
    expect(within(select as HTMLElement).getByRole('option', { name: /direito/i })).toBeInTheDocument()
    expect(within(select as HTMLElement).getByRole('option', { name: /engenharia de software/i })).toBeInTheDocument()
    expect(within(select as HTMLElement).getByRole('option', { name: /administração/i })).toBeInTheDocument()
    // Curso não presente nas dores NÃO deve aparecer
    expect(within(select as HTMLElement).queryByRole('option', { name: /psicologia/i })).toBeNull()
  })

  it('NÃO mostra opção "Minha Coordenação" para aluno', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="aluno"
        vinculosUsuario={VINCULOS_ALUNO}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por curso/i })
    expect(within(select as HTMLElement).queryByRole('option', { name: /minha coordenação/i })).toBeNull()
  })

  it('mostra opção "Minha Coordenação" para coordenador quando cursosCoordenacao não está vazio', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="coordenador"
        vinculosUsuario={VINCULOS_COORD}
        cursosCoordenacao={['direito']}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por curso/i })
    expect(within(select as HTMLElement).getByRole('option', { name: /minha coordenação/i })).toBeInTheDocument()
  })

  it('NÃO mostra opção "Minha Coordenação" para coordenador quando cursosCoordenacao é vazio', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="coordenador"
        vinculosUsuario={VINCULOS_COORD}
        cursosCoordenacao={[]}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por curso/i })
    expect(within(select as HTMLElement).queryByRole('option', { name: /minha coordenação/i })).toBeNull()
  })

  it('filtrar por "Direito" exibe só dores com curso direito', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por curso/i })
    fireEvent.change(select, { target: { value: 'direito' } })
    // dor-1 e dor-4 têm curso direito
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('filtrar por "Minha Coordenação" exibe dores do curso do coord', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="coordenador"
        vinculosUsuario={VINCULOS_COORD}
        cursosCoordenacao={['direito']}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por curso/i })
    fireEvent.change(select, { target: { value: '__minha_coord__' } })
    // dor-1 e dor-4 têm curso direito (coordenação do coord)
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// § C — Filtro Empresa
// ---------------------------------------------------------------------------

describe('Filtros — Empresa', () => {
  it('select "Filtrar por empresa" tem opção Todas (default)', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por empresa/i })
    expect(select).toBeInTheDocument()
    expect(within(select as HTMLElement).getByRole('option', { name: /todas/i })).toBeInTheDocument()
  })

  it('opções de empresa são derivadas das dores (sem duplicatas)', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por empresa/i })
    const options = within(select as HTMLElement).getAllByRole('option')
    // "Empresa Alpha" aparece 2x nas dores, mas só 1x no select + "Todas"
    const nomes = options.map((o) => o.textContent)
    const alphaCount = nomes.filter((n) => n === 'Empresa Alpha').length
    expect(alphaCount).toBe(1)
    expect(options).toHaveLength(4) // Todas + Alpha + Beta + Gamma
  })

  it('filtrar por empresa reduz os cards corretamente', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por empresa/i })
    fireEvent.change(select, { target: { value: 'Empresa Beta' } })
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// § D — Filtro Andamento
// ---------------------------------------------------------------------------

describe('Filtros — Andamento', () => {
  it('select "Filtrar por andamento" tem as 5 opções esperadas', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por andamento/i })
    expect(within(select as HTMLElement).getByRole('option', { name: /^todos$/i })).toBeInTheDocument()
    expect(within(select as HTMLElement).getByRole('option', { name: /publicada/i })).toBeInTheDocument()
    expect(within(select as HTMLElement).getByRole('option', { name: /em análise/i })).toBeInTheDocument()
    expect(within(select as HTMLElement).getByRole('option', { name: /virou caso/i })).toBeInTheDocument()
    expect(within(select as HTMLElement).getByRole('option', { name: /finalizado/i })).toBeInTheDocument()
  })

  it('Andamento = Publicada: só dor sem projeto_id', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por andamento/i })
    fireEvent.change(select, { target: { value: 'publicada' } })
    expect(screen.getAllByRole('article')).toHaveLength(1) // só dor-1
  })

  it('Andamento = Em análise: só dores com projeto em_analise', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por andamento/i })
    fireEvent.change(select, { target: { value: 'em_analise' } })
    expect(screen.getAllByRole('article')).toHaveLength(1) // só dor-2
  })

  it('Andamento = Virou caso: dores com derivarEstagioSelo === "caso"', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por andamento/i })
    fireEvent.change(select, { target: { value: 'caso' } })
    expect(screen.getAllByRole('article')).toHaveLength(1) // só dor-3 (aprovado)
  })

  it('Andamento = Finalizado: dores com derivarEstagioSelo === "finalizado"', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por andamento/i })
    fireEvent.change(select, { target: { value: 'finalizado' } })
    expect(screen.getAllByRole('article')).toHaveLength(1) // só dor-4
  })
})

// ---------------------------------------------------------------------------
// § E — Filtro Participação
// ---------------------------------------------------------------------------

describe('Filtros — Participação', () => {
  it('NÃO renderiza filtro de Participação para representante', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={true}
        papelUsuario="representante"
        vinculosUsuario={{ indicadoProjetoIds: [], membroProjetoIds: [], hostProjetoIds: [] }}
      />
    )
    const sel = container.querySelector('[aria-label="Filtrar por participação"]')
    expect(sel).toBeNull()
  })

  it('NÃO renderiza filtro de Participação quando vinculosUsuario ausente', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="aluno"
        vinculosUsuario={undefined}
      />
    )
    const sel = container.querySelector('[aria-label="Filtrar por participação"]')
    expect(sel).toBeNull()
  })

  it('renderiza filtro Participação para aluno com vinculos', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="aluno"
        vinculosUsuario={VINCULOS_ALUNO}
      />
    )
    expect(screen.getByRole('combobox', { name: /filtrar por participação/i })).toBeInTheDocument()
  })

  it('Participação = Indicado: dores em que usuário está indicado', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="aluno"
        vinculosUsuario={VINCULOS_ALUNO}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por participação/i })
    fireEvent.change(select, { target: { value: 'indicado' } })
    // proj-a = dor-2
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('Participação = Membro: dores em que usuário é membro', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="aluno"
        vinculosUsuario={VINCULOS_ALUNO}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por participação/i })
    fireEvent.change(select, { target: { value: 'membro' } })
    // proj-b = dor-3
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('Participação = Não indicado: dores em janela de indicação, usuário não indicado/membro', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="aluno"
        vinculosUsuario={VINCULOS_ALUNO}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por participação/i })
    fireEvent.change(select, { target: { value: 'nao_indicado' } })
    // Nenhuma dor em em_analise onde aluno NÃO está indicado
    // dor-2 = em_analise, proj-a está em indicadoProjetoIds → excluída
    // Resultado: 0 dores → empty state
    expect(screen.queryByRole('article')).toBeNull()
  })

  it('Participação = Host: só para coordenador, dores onde é host', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="coordenador"
        vinculosUsuario={VINCULOS_COORD}
        cursosCoordenacao={['direito']}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por participação/i })
    expect(within(select as HTMLElement).getByRole('option', { name: /host/i })).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'host' } })
    // hostProjetoIds = ['proj-b'] = dor-3
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('Participação = Host NÃO aparece para aluno', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="aluno"
        vinculosUsuario={VINCULOS_ALUNO}
      />
    )
    const select = screen.getByRole('combobox', { name: /filtrar por participação/i })
    expect(within(select as HTMLElement).queryByRole('option', { name: /host/i })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// § F — AND entre dimensões
// ---------------------------------------------------------------------------

describe('Filtros — AND entre dimensões', () => {
  it('combinar Curso + Andamento aplica AND (interseção)', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    // Filtrar por curso direito (dor-1, dor-4) E andamento finalizado (dor-4)
    // resultado = dor-4
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por curso/i }), {
      target: { value: 'direito' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por andamento/i }), {
      target: { value: 'finalizado' },
    })
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('combinar Empresa + Andamento: interseção vazia → empty state', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    // Empresa Beta (dor-2) + Andamento finalizado (dor-4) → interseção vazia
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por empresa/i }), {
      target: { value: 'Empresa Beta' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por andamento/i }), {
      target: { value: 'finalizado' },
    })
    expect(screen.queryByRole('article')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// § G — Empty state de filtros
// ---------------------------------------------------------------------------

describe('Filtros — Empty state', () => {
  it('mostra empty state quando filtro ativo zera resultados', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por empresa/i }), {
      target: { value: 'Empresa Beta' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por andamento/i }), {
      target: { value: 'finalizado' },
    })
    // Deve mostrar o empty state de filtros, não o empty state "sem dores"
    expect(screen.getByText(/nenhuma dor com esses filtros/i)).toBeInTheDocument()
    expect(screen.getByText(/ajuste ou limpe os filtros/i)).toBeInTheDocument()
  })

  it('botão "Limpar filtros" no empty state reseta todos os filtros', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por empresa/i }), {
      target: { value: 'Empresa Beta' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por andamento/i }), {
      target: { value: 'finalizado' },
    })
    // Dois botões "Limpar filtros" coexistem (barra + empty state); clica no do empty state
    const botoesLimpar = screen.getAllByRole('button', { name: /limpar filtros/i })
    // O botão do empty state é o último (renderizado dentro de .ubm-empty--filtros)
    fireEvent.click(botoesLimpar[botoesLimpar.length - 1])
    // Volta a exibir todos os cards
    expect(screen.getAllByRole('article')).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// § H — Contagem + chips de filtro ativo
// ---------------------------------------------------------------------------

describe('Filtros — Contagem + chips', () => {
  it('linha de resultado tem aria-live="polite"', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull()
  })

  it('contagem reflete total sem filtro ativo ("4 dores")', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    // <b>4</b> + " dores" — checamos o <b> + texto do pai
    const contagem = container.querySelector('.ubm-filtros-contagem')
    expect(contagem).not.toBeNull()
    expect(contagem?.textContent).toMatch(/4\s*dores/i)
  })

  it('contagem reflete resultado filtrado ("2 dores" com filtro direito)', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por curso/i }), {
      target: { value: 'direito' },
    })
    const contagem = container.querySelector('.ubm-filtros-contagem')
    expect(contagem?.textContent).toMatch(/2\s*dores/i)
  })

  it('contagem singular: "1 dor" quando filtro retorna 1', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por andamento/i }), {
      target: { value: 'finalizado' },
    })
    const contagem = container.querySelector('.ubm-filtros-contagem')
    expect(contagem?.textContent).toMatch(/1\s*dor\b/i)
  })

  it('chip aparece quando filtro está ativo', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por andamento/i }), {
      target: { value: 'finalizado' },
    })
    expect(container.querySelector('.ubm-filtro-chip')).not.toBeNull()
  })

  it('chip NÃO aparece sem filtro ativo', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(container.querySelector('.ubm-filtro-chip')).toBeNull()
  })

  it('botão "Limpar filtros" só aparece quando há filtro ativo', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    // Sem filtro: sem botão "Limpar filtros"
    expect(screen.queryByRole('button', { name: /limpar filtros/i })).toBeNull()

    // Com filtro: aparece
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por andamento/i }), {
      target: { value: 'finalizado' },
    })
    expect(screen.getByRole('button', { name: /limpar filtros/i })).toBeInTheDocument()
  })

  it('botão ✕ do chip remove só aquela dimensão', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    // Ativar dois filtros
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por curso/i }), {
      target: { value: 'direito' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por andamento/i }), {
      target: { value: 'finalizado' },
    })
    // 1 resultado (interseção)
    expect(screen.getAllByRole('article')).toHaveLength(1)

    // Remove filtro de andamento via ✕
    const btnX = screen.getByRole('button', { name: /remover filtro de andamento/i })
    fireEvent.click(btnX)
    // Agora só filtro de curso direito ativo → 2 resultados
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('botão "Limpar filtros" zera todas as dimensões', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por curso/i }), {
      target: { value: 'direito' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por andamento/i }), {
      target: { value: 'finalizado' },
    })
    const btnLimpar = screen.getByRole('button', { name: /limpar filtros/i })
    fireEvent.click(btnLimpar)
    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /limpar filtros/i })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// § I — a11y: aria-label nos selects
// ---------------------------------------------------------------------------

describe('Filtros — a11y (aria-label)', () => {
  it('cada select tem aria-label adequado', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        papelUsuario="aluno"
        vinculosUsuario={VINCULOS_ALUNO}
      />
    )
    expect(screen.getByRole('combobox', { name: /filtrar por curso/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /filtrar por empresa/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /filtrar por andamento/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /filtrar por participação/i })).toBeInTheDocument()
  })

  it('botão ✕ de chip tem aria-label que menciona a dimensão', () => {
    render(
      <DoresPage
        doresPublicadas={TODAS_DORES}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    fireEvent.change(screen.getByRole('combobox', { name: /filtrar por curso/i }), {
      target: { value: 'direito' },
    })
    const btn = screen.getByRole('button', { name: /remover filtro de curso/i })
    expect(btn).toBeInTheDocument()
  })
})
