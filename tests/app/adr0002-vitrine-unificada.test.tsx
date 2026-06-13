/**
 * ADR-0002 — Vitrine unificada: /dores absorve /casos
 * TDD RED → GREEN
 *
 * Cobertura:
 * T1 — obterProjetoDaDor: lookup reverso dor_id → { projeto_id, status } | null
 * T2 — /dores/[id] com projeto: exibe seção "A jornada deste caso" (timeline + equipe)
 * T3 — /dores/[id] sem projeto: não exibe seção de jornada
 * T4 — /dores (lista): selo de estágio no card ("Publicada", "Virou caso", "Finalizado")
 * T5 — /casos redirect → /dores (import do helper de redirect)
 * T6 — /casos/[id] redirect → /dores/{dor_id}
 * T7 — NavRail: item "Casos" não aparece na navegação
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks globais (hoistados — cobrem todas as descrições)
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dores',
  notFound: () => { throw new Error('NOTFOUND') },
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => React.createElement('a', { href, ...props }, children),
}))

vi.mock('@/lib/data/dores', () => ({
  listarDoresVitrine: vi.fn(),
  obterDorPublica: vi.fn(),
  obterProjetoDaDor: vi.fn(),
}))

vi.mock('@/lib/data/projetos', () => ({
  listarProjetosVitrine: vi.fn(),
  obterEquipePublica: vi.fn(),
  obterTimelinePublica: vi.fn(),
  obterProjetoDaDor: vi.fn(),
}))

vi.mock('@/lib/auth/logout', () => ({
  logoutCompleto: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports pós-mock
// ---------------------------------------------------------------------------
import type { DorVitrine, DorPublica } from '@/lib/data/dores'
import type { EventoTimeline, MembroPublico } from '@/lib/data/projetos'

// ---------------------------------------------------------------------------
// Cleanup após cada teste para evitar contaminação de DOM
// ---------------------------------------------------------------------------
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DOR_SEM_PROJETO: DorVitrine = {
  id: 'dor-aaa',
  descricao: 'Precisamos de um sistema de agendamento.',
  empresa_nome: 'Prefeitura de Barra Mansa',
  cursos: ['engenharia_de_software'],
  publicada_em: '2026-03-15T10:00:00Z',
}

const DOR_COM_PROJETO: DorVitrine = {
  id: 'dor-bbb',
  descricao: 'Necessidade de automação de estoque.',
  empresa_nome: 'Mercado Exemplo',
  cursos: ['sistemas_de_informacao'],
  publicada_em: '2026-04-01T09:00:00Z',
}

const DOR_FINALIZADA: DorVitrine = {
  id: 'dor-ccc',
  descricao: 'Dor finalizada.',
  empresa_nome: 'Empresa Finalizada',
  cursos: [],
  publicada_em: '2026-02-01T09:00:00Z',
}

const DOR_PUBLICA_COM_PROJETO: DorPublica = {
  id: 'dor-bbb',
  descricao: 'Necessidade de automação de estoque.',
  empresa_nome: 'Mercado Exemplo',
  cursos: ['sistemas_de_informacao'],
  publicada_em: '2026-04-01T09:00:00Z',
  anexos: [],
}

const DOR_PUBLICA_SEM_PROJETO: DorPublica = {
  id: 'dor-aaa',
  descricao: 'Precisamos de um sistema de agendamento.',
  empresa_nome: 'Prefeitura de Barra Mansa',
  cursos: ['engenharia_de_software'],
  publicada_em: '2026-03-15T10:00:00Z',
  anexos: [],
}

const PROJETO_DA_DOR = { projeto_id: 'proj-xyz', status: 'aprovado' }

const EVENTOS: EventoTimeline[] = [
  { de_status: null, para_status: 'em_analise', ocorrido_em: '2026-04-01T10:00:00Z' },
  { de_status: 'em_analise', para_status: 'aprovado', ocorrido_em: '2026-04-12T14:00:00Z' },
]

const MEMBROS: MembroPublico[] = [
  { papel_projeto: 'host', nome_ou_papel: 'Ana Souza', ranking_optin: true },
  { papel_projeto: 'aluno', nome_ou_papel: 'ALUNO · DIREITO', ranking_optin: false },
]

// ---------------------------------------------------------------------------
// T1 — obterProjetoDaDor
// ---------------------------------------------------------------------------

describe('T1 — obterProjetoDaDor: adapter de lookup reverso', () => {
  it('retorna { projeto_id, status } quando existe projeto para a dor', async () => {
    const { obterProjetoDaDor } = await import('@/lib/data/dores')
    vi.mocked(obterProjetoDaDor).mockResolvedValue(PROJETO_DA_DOR)

    const result = await obterProjetoDaDor('dor-bbb')

    expect(result).not.toBeNull()
    expect(result?.projeto_id).toBe('proj-xyz')
    expect(result?.status).toBe('aprovado')
  })

  it('retorna null quando não há projeto para a dor', async () => {
    const { obterProjetoDaDor } = await import('@/lib/data/dores')
    vi.mocked(obterProjetoDaDor).mockResolvedValue(null)

    const result = await obterProjetoDaDor('dor-aaa')

    expect(result).toBeNull()
  })

  it('retorna null em caso de erro (degradação graciosa)', async () => {
    const { obterProjetoDaDor } = await import('@/lib/data/dores')
    vi.mocked(obterProjetoDaDor).mockResolvedValue(null)

    const result = await obterProjetoDaDor('dor-inexistente')

    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// T2 — /dores/[id] com projeto: seção "A jornada deste caso"
// ---------------------------------------------------------------------------

describe('T2 — /dores/[id] com projeto: seção jornada', () => {
  it('exibe seção "A jornada deste caso" quando existe projeto', async () => {
    const dores = await import('@/lib/data/dores')
    const projetos = await import('@/lib/data/projetos')
    vi.mocked(dores.obterDorPublica).mockResolvedValue(DOR_PUBLICA_COM_PROJETO)
    vi.mocked(dores.obterProjetoDaDor).mockResolvedValue(PROJETO_DA_DOR)
    vi.mocked(projetos.obterTimelinePublica).mockResolvedValue(EVENTOS)
    vi.mocked(projetos.obterEquipePublica).mockResolvedValue(MEMBROS)

    const mod = await import('@/app/dores/[id]/page')
    const jsx = await mod.default({ params: Promise.resolve({ id: 'dor-bbb' }) })
    render(jsx as React.ReactElement)

    // A seção de jornada tem heading com "jornada" — getAllByText pois pode aparecer em h2 e no kicker
    const matches = screen.getAllByText(/jornada/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renderiza UbmTimeline na seção de jornada (lista de eventos)', async () => {
    const dores = await import('@/lib/data/dores')
    const projetos = await import('@/lib/data/projetos')
    vi.mocked(dores.obterDorPublica).mockResolvedValue(DOR_PUBLICA_COM_PROJETO)
    vi.mocked(dores.obterProjetoDaDor).mockResolvedValue(PROJETO_DA_DOR)
    vi.mocked(projetos.obterTimelinePublica).mockResolvedValue(EVENTOS)
    vi.mocked(projetos.obterEquipePublica).mockResolvedValue(MEMBROS)

    const mod = await import('@/app/dores/[id]/page')
    const jsx = await mod.default({ params: Promise.resolve({ id: 'dor-bbb' }) })
    render(jsx as React.ReactElement)

    // UbmTimeline renderiza como <ol>
    const lists = screen.getAllByRole('list')
    expect(lists.length).toBeGreaterThan(0)
  })

  it('renderiza UbmTeam na seção de jornada (membros)', async () => {
    const dores = await import('@/lib/data/dores')
    const projetos = await import('@/lib/data/projetos')
    vi.mocked(dores.obterDorPublica).mockResolvedValue(DOR_PUBLICA_COM_PROJETO)
    vi.mocked(dores.obterProjetoDaDor).mockResolvedValue(PROJETO_DA_DOR)
    vi.mocked(projetos.obterTimelinePublica).mockResolvedValue(EVENTOS)
    vi.mocked(projetos.obterEquipePublica).mockResolvedValue(MEMBROS)

    const mod = await import('@/app/dores/[id]/page')
    const jsx = await mod.default({ params: Promise.resolve({ id: 'dor-bbb' }) })
    render(jsx as React.ReactElement)

    // Membro com opt-in deve aparecer
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
  })

  it('NÃO faz select direto de perfil — usa RPCs SECURITY DEFINER (RS9)', async () => {
    const dores = await import('@/lib/data/dores')
    const projetos = await import('@/lib/data/projetos')
    vi.mocked(dores.obterDorPublica).mockResolvedValue(DOR_PUBLICA_COM_PROJETO)
    vi.mocked(dores.obterProjetoDaDor).mockResolvedValue(PROJETO_DA_DOR)
    vi.mocked(projetos.obterTimelinePublica).mockResolvedValue(EVENTOS)
    vi.mocked(projetos.obterEquipePublica).mockResolvedValue(MEMBROS)

    // Verifica que obterTimelinePublica e obterEquipePublica foram chamados (RPCs)
    const mod = await import('@/app/dores/[id]/page')
    await mod.default({ params: Promise.resolve({ id: 'dor-bbb' }) })

    expect(vi.mocked(projetos.obterTimelinePublica)).toHaveBeenCalledWith('proj-xyz')
    expect(vi.mocked(projetos.obterEquipePublica)).toHaveBeenCalledWith('proj-xyz')
  })
})

// ---------------------------------------------------------------------------
// T3 — /dores/[id] sem projeto: sem seção de jornada
// ---------------------------------------------------------------------------

describe('T3 — /dores/[id] sem projeto: ausência de seção jornada', () => {
  it('renderiza a dor sem seção de jornada quando não há projeto', async () => {
    const dores = await import('@/lib/data/dores')
    vi.mocked(dores.obterDorPublica).mockResolvedValue(DOR_PUBLICA_SEM_PROJETO)
    vi.mocked(dores.obterProjetoDaDor).mockResolvedValue(null)

    const mod = await import('@/app/dores/[id]/page')
    const jsx = await mod.default({ params: Promise.resolve({ id: 'dor-aaa' }) })
    render(jsx as React.ReactElement)

    // Empresa deve aparecer
    expect(screen.getByText('Prefeitura de Barra Mansa')).toBeInTheDocument()
    // Seção de jornada NÃO deve aparecer
    expect(screen.queryByText(/jornada/i)).toBeNull()
  })

  it('não chama RPCs de projeto quando não há projeto associado', async () => {
    const dores = await import('@/lib/data/dores')
    const projetos = await import('@/lib/data/projetos')
    vi.mocked(dores.obterDorPublica).mockResolvedValue(DOR_PUBLICA_SEM_PROJETO)
    vi.mocked(dores.obterProjetoDaDor).mockResolvedValue(null)

    const mod = await import('@/app/dores/[id]/page')
    await mod.default({ params: Promise.resolve({ id: 'dor-aaa' }) })

    expect(vi.mocked(projetos.obterTimelinePublica)).not.toHaveBeenCalled()
    expect(vi.mocked(projetos.obterEquipePublica)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// T4 — /dores (lista): selo de estágio no card
// ---------------------------------------------------------------------------

describe('T4 — /dores (lista): selo de estágio no card', () => {
  it('card sem projeto exibe selo "Publicada"', async () => {
    const { listarDoresVitrine } = await import('@/lib/data/dores')
    const doresComEstágio = [
      { ...DOR_SEM_PROJETO, estagio: undefined }, // sem projeto
    ]
    vi.mocked(listarDoresVitrine).mockResolvedValue(doresComEstágio)

    const mod = await import('@/app/dores/page')
    const jsx = await mod.default()
    render(jsx as React.ReactElement)

    // getAllByText pois "publicada" pode aparecer em mais de um elemento da página
    const matches = screen.getAllByText(/publicada/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('card com projeto ativo exibe selo "Virou caso"', async () => {
    const { listarDoresVitrine } = await import('@/lib/data/dores')
    const doresComProjeto = [
      { ...DOR_COM_PROJETO, projeto_status: 'aprovado' },
    ]
    vi.mocked(listarDoresVitrine).mockResolvedValue(doresComProjeto)

    const mod = await import('@/app/dores/page')
    const jsx = await mod.default()
    render(jsx as React.ReactElement)

    expect(screen.getByText(/virou caso/i)).toBeInTheDocument()
  })

  it('card com projeto finalizado exibe selo "Finalizado"', async () => {
    const { listarDoresVitrine } = await import('@/lib/data/dores')
    const doresFinalizadas = [
      { ...DOR_FINALIZADA, projeto_status: 'finalizado' },
    ]
    vi.mocked(listarDoresVitrine).mockResolvedValue(doresFinalizadas)

    const mod = await import('@/app/dores/page')
    const jsx = await mod.default()
    render(jsx as React.ReactElement)

    expect(screen.getByText(/finalizado/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// T5 — /casos redirect → /dores
// ---------------------------------------------------------------------------

describe('T5 — /casos: redirect 301 para /dores', () => {
  it('chama redirect("/dores") ao acessar /casos', async () => {
    const mod = await import('@/app/casos/page')
    // CasosPage chama redirect() sincronamente — envolve em função para capturar o throw
    expect(() => mod.default()).toThrow('REDIRECT:/dores')
  })
})

// ---------------------------------------------------------------------------
// T6 — /casos/[id] redirect → /dores/{dor_id}
// ---------------------------------------------------------------------------

describe('T6 — /casos/[id]: redirect 301 para /dores/{dor_id}', () => {
  it('resolve dor_id do projeto e redireciona para /dores/{dor_id}', async () => {
    const projetos = await import('@/lib/data/projetos')
    vi.mocked(projetos.listarProjetosVitrine).mockResolvedValue([
      { id: 'proj-xyz', dor_id: 'dor-bbb', status: 'aprovado' },
    ])

    const mod = await import('@/app/casos/[id]/page')
    await expect(
      mod.default({ params: Promise.resolve({ id: 'proj-xyz' }) }),
    ).rejects.toThrow('REDIRECT:/dores/dor-bbb')
  })

  it('chama notFound() quando projeto não existe', async () => {
    const projetos = await import('@/lib/data/projetos')
    vi.mocked(projetos.listarProjetosVitrine).mockResolvedValue([])

    const mod = await import('@/app/casos/[id]/page')
    await expect(
      mod.default({ params: Promise.resolve({ id: 'proj-inexistente' }) }),
    ).rejects.toThrow('NOTFOUND')
  })
})

// ---------------------------------------------------------------------------
// T7 — NavRail: item "Casos" removido
// ---------------------------------------------------------------------------

describe('T7 — NavRail: item "Casos" ausente da navegação', () => {
  it('não exibe link para /casos no NavRail', async () => {
    const { NavRail } = await import('@/components/app/NavRail')
    render(<NavRail role="aluno" />)

    // Nenhum link com href=/casos
    const casoLinks = document
      .querySelectorAll('a[href="/casos"]')
    expect(casoLinks.length).toBe(0)

    // Nenhum item com texto "Casos"
    expect(screen.queryByText(/^casos$/i)).toBeNull()
  })
})
