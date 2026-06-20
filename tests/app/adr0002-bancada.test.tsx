/**
 * ADR-0002 — Bancada por papel (/app RSC ramificado)
 * TDD RED → GREEN
 *
 * Cobertura:
 * B1 — Representante: exibe "Minhas dores" + CTA "Propor nova dor"
 * B2 — Representante vazio: estado vazio humanizado
 * B3 — Aluno: exibe oportunidades + atalhos (indicações, tarefas)
 * B4 — Aluno vazio: estado vazio humanizado
 * B5 — Coordenador: exibe fila de indicações + badge de pendência
 * B6 — Admin: exibe moderação pendente + atalhos
 * B7 — Saudação com nome do usuário
 * B8 — Graceful degradation: widget com erro não derruba a página
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks globais
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app',
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
  notFound: () => { throw new Error('NOTFOUND') },
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

vi.mock('@/lib/data/perfil', () => ({
  getPerfil: vi.fn(),
}))

vi.mock('@/lib/data/projetos', () => ({
  listarMeusProjetos: vi.fn(),
  listarMinhasTarefasAbertas: vi.fn(),
  listarMinhasIndicacoes: vi.fn(),
  contarMinhasDoresPorStatus: vi.fn(),
  listarIndicacoes: vi.fn(),
  listarProjetosVitrine: vi.fn(),
  obterEquipePublica: vi.fn(),
  obterTimelinePublica: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', app_metadata: { is_admin: false } } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Imports de componentes (pós-mock)
// ---------------------------------------------------------------------------
import {
  BancadaRepresentante,
  BancadaAluno,
  BancadaCoordenador,
  BancadaAdmin,
} from '@/components/app/Bancada'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DORES_REPRESENTANTE = [
  {
    projeto_id: 'p1', dor_id: 'd1', status: 'aprovado',
    empresa_nome: 'Prefeitura Barra Mansa', papel_projeto: 'host',
  },
]

const TAREFAS = [
  {
    id: 't1', projeto_id: 'p1', titulo: 'Implementar módulo X',
    descricao: null, created_at: '2026-06-01T10:00:00Z',
  },
]

const INDICACOES = [
  {
    id: 'i1', projeto_id: 'p1', papel_pretendido: 'aluno',
    created_at: '2026-06-01T10:00:00Z',
  },
]

const CONTAGEM_DORES = {
  rascunho: 1, em_moderacao: 1, publicada: 1, arquivada: 0, total: 3,
}

// ---------------------------------------------------------------------------
// B1 — Representante: exibe "Minhas dores" + CTA
// ---------------------------------------------------------------------------

describe('B1 — Representante: bloco dominante + CTA', () => {
  it('renderiza o bloco dominante "Minhas dores"', () => {
    render(
      <BancadaRepresentante
        meusProjetos={DORES_REPRESENTANTE}
        contagemDores={CONTAGEM_DORES}
        nome="Rafael"
      />,
    )

    // Bloco dominante deve estar presente — getAllByText pois o título aparece em h2 e no kicker
    expect(screen.getAllByText(/minhas dores/i).length).toBeGreaterThan(0)
  })

  it('exibe CTA primário "Propor nova dor"', () => {
    render(
      <BancadaRepresentante
        meusProjetos={DORES_REPRESENTANTE}
        contagemDores={CONTAGEM_DORES}
        nome="Rafael"
      />,
    )

    const cta = screen.getByRole('link', { name: /propor/i })
    expect(cta).toBeInTheDocument()
  })

  it('CTA "Propor nova dor" aponta para a rota INTERNA (/app/dores/nova), não a captação anônima /propor', () => {
    render(
      <BancadaRepresentante
        meusProjetos={DORES_REPRESENTANTE}
        contagemDores={CONTAGEM_DORES}
        nome="Rafael"
      />,
    )

    const cta = screen.getByRole('link', { name: /propor nova dor/i })
    // representante logado cria pela rota autenticada (sem repetir dados da empresa)
    expect(cta).toHaveAttribute('href', '/app/dores/nova')
  })

  it('métrica reflete dores em_moderacao (campo real), não o antigo em_analise', () => {
    render(
      <BancadaRepresentante
        meusProjetos={[]}
        contagemDores={{ rascunho: 0, em_moderacao: 2, publicada: 0, arquivada: 0, total: 2 }}
        nome="Rafael"
      />,
    )
    // Bancada deve ler contagemDores.em_moderacao (dor pendente = em_moderacao; em_analise é de PROJETO)
    expect(screen.getByText(/você tem 2 em moderação/i)).toBeInTheDocument()
  })

  it('exibe métrica enxuta de status das dores', () => {
    render(
      <BancadaRepresentante
        meusProjetos={DORES_REPRESENTANTE}
        contagemDores={CONTAGEM_DORES}
        nome="Rafael"
      />,
    )

    // Deve mostrar contagem de dores — getAllByText pois o texto pode aparecer em múltiplos nós
    expect(screen.getAllByText(/moderação|publicada|análise|dor/i).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// B2 — Representante vazio
// ---------------------------------------------------------------------------

describe('B2 — Representante vazio: estado humanizado', () => {
  it('exibe estado vazio quando não há projetos', () => {
    render(
      <BancadaRepresentante
        meusProjetos={[]}
        contagemDores={{ rascunho: 0, em_moderacao: 0, publicada: 0, arquivada: 0, total: 0 }}
        nome="Rafael"
      />,
    )

    // Estado vazio humanizado — getAllByText pois o CTA "propor" pode aparecer em link e texto
    expect(screen.getAllByText(/nenhuma dor|primeira dor|propor/i).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// B3 — Aluno: oportunidades + atalhos
// ---------------------------------------------------------------------------

describe('B3 — Aluno: oportunidades + atalhos', () => {
  it('renderiza o bloco "Oportunidades" para o aluno', () => {
    render(
      <BancadaAluno
        indicacoes={INDICACOES}
        tarefas={TAREFAS}
        nome="João"
      />,
    )

    expect(screen.getAllByText(/oportunidades|indicações|tarefas/i).length).toBeGreaterThan(0)
  })

  it('exibe CTA primário "Ver dores do meu curso"', () => {
    render(
      <BancadaAluno
        indicacoes={INDICACOES}
        tarefas={TAREFAS}
        nome="João"
      />,
    )

    const cta = screen.getByRole('link', { name: /dores.*curso|curso.*dores|ver dores/i })
    expect(cta).toBeInTheDocument()
  })

  it('exibe atalho de indicações quando há indicações ativas', () => {
    render(
      <BancadaAluno
        indicacoes={INDICACOES}
        tarefas={TAREFAS}
        nome="João"
      />,
    )

    expect(screen.getAllByText(/indicação|indicações/i).length).toBeGreaterThan(0)
  })

  it('exibe atalho de tarefas com contagem quando há tarefas', () => {
    render(
      <BancadaAluno
        indicacoes={INDICACOES}
        tarefas={TAREFAS}
        nome="João"
      />,
    )

    // Deve exibir o número de tarefas ou o link de tarefas
    expect(screen.getAllByText(/tarefa|tarefas/i).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// B4 — Aluno vazio
// ---------------------------------------------------------------------------

describe('B4 — Aluno vazio: estado humanizado', () => {
  it('exibe estado vazio quando não há indicações nem tarefas', () => {
    render(
      <BancadaAluno
        indicacoes={[]}
        tarefas={[]}
        nome="João"
      />,
    )

    expect(screen.getAllByText(/sem.*oportunidades|curso.*aparece|aguardando/i).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// B5 — Coordenador: fila de decisão + badge marsala
// ---------------------------------------------------------------------------

describe('B5 — Coordenador: fila de decisão', () => {
  it('renderiza o bloco de fila de decisão', () => {
    render(
      <BancadaCoordenador
        indicacoes={[
          {
            id: 'i1', projeto_id: 'p1', papel_pretendido: 'aluno' as const,
            mensagem: null, created_at: '2026-06-01', deleted_at: null,
            aluno_nome: 'Maria', aluno_email: 'maria@ubm.edu.br', curso: 'Engenharia de Software',
          },
        ]}
        nome="Ana"
      />,
    )

    expect(screen.getAllByText(/fila|indicações|revisar/i).length).toBeGreaterThan(0)
  })

  it('exibe CTA primário "Revisar indicações"', () => {
    render(
      <BancadaCoordenador
        indicacoes={[
          {
            id: 'i1', projeto_id: 'p1', papel_pretendido: 'aluno' as const,
            mensagem: null, created_at: '2026-06-01', deleted_at: null,
            aluno_nome: 'Maria', aluno_email: 'maria@ubm.edu.br', curso: 'Engenharia de Software',
          },
        ]}
        nome="Ana"
      />,
    )

    const cta = screen.getByRole('link', { name: /revisar|indicações/i })
    expect(cta).toBeInTheDocument()
  })

  it('exibe badge de pendência quando há indicações', () => {
    render(
      <BancadaCoordenador
        indicacoes={[
          {
            id: 'i1', projeto_id: 'p1', papel_pretendido: 'aluno' as const,
            mensagem: null, created_at: '2026-06-01', deleted_at: null,
            aluno_nome: 'Maria', aluno_email: 'maria@ubm.edu.br', curso: 'Engenharia de Software',
          },
        ]}
        nome="Ana"
      />,
    )

    // Badge numérico de pendência (1 indicação)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('exibe estado vazio quando fila está em dia', () => {
    render(
      <BancadaCoordenador
        indicacoes={[]}
        nome="Ana"
      />,
    )

    expect(screen.getAllByText(/em dia|nenhuma/i).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// B6 — Admin: moderação pendente + atalhos
// ---------------------------------------------------------------------------

describe('B6 — Admin: saúde da plataforma', () => {
  it('renderiza o bloco de moderação pendente', () => {
    render(
      <BancadaAdmin
        qtdDoresPendentes={4}
        qtdProjetosPendentes={1}
        nome="Admin"
      />,
    )

    expect(screen.getAllByText(/moderação|pendente/i).length).toBeGreaterThan(0)
  })

  it('exibe CTA primário "Moderar dores"', () => {
    render(
      <BancadaAdmin
        qtdDoresPendentes={4}
        qtdProjetosPendentes={1}
        nome="Admin"
      />,
    )

    const cta = screen.getByRole('link', { name: /moderar/i })
    expect(cta).toBeInTheDocument()
  })

  it('exibe atalhos de usuários e auditoria', () => {
    render(
      <BancadaAdmin
        qtdDoresPendentes={4}
        qtdProjetosPendentes={1}
        nome="Admin"
      />,
    )

    expect(screen.getByRole('link', { name: /usuários|usuários/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /auditoria/i })).toBeInTheDocument()
  })

  it('exibe estado saudável quando não há pendências', () => {
    render(
      <BancadaAdmin
        qtdDoresPendentes={0}
        qtdProjetosPendentes={0}
        nome="Admin"
      />,
    )

    expect(screen.getAllByText(/saudável|nada.*moderação|tudo fluindo/i).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// B7 — Saudação com nome
// ---------------------------------------------------------------------------

describe('B7 — Saudação com nome do usuário', () => {
  it('exibe saudação com o nome do representante', () => {
    render(
      <BancadaRepresentante
        meusProjetos={[]}
        contagemDores={{ rascunho: 0, em_moderacao: 0, publicada: 0, arquivada: 0, total: 0 }}
        nome="Rafael"
      />,
    )

    expect(screen.getByText(/rafael/i)).toBeInTheDocument()
  })

  it('exibe saudação genérica quando nome não está disponível', () => {
    render(
      <BancadaRepresentante
        meusProjetos={[]}
        contagemDores={{ rascunho: 0, em_moderacao: 0, publicada: 0, arquivada: 0, total: 0 }}
        nome={null}
      />,
    )

    // "Bem-vindo" pode aparecer em heading e cota — getAllByText
    expect(screen.getAllByText(/bem-vindo|bancada/i).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// B8 — Graceful degradation
// ---------------------------------------------------------------------------

describe('B8 — Graceful degradation por-widget', () => {
  it('BancadaAluno renderiza mesmo sem indicações (degradação graciosa)', () => {
    // Props com dados vazios — sem erro
    expect(() =>
      render(
        <BancadaAluno
          indicacoes={[]}
          tarefas={[]}
          nome="João"
        />,
      ),
    ).not.toThrow()
  })

  it('BancadaAdmin renderiza com qtd zero (sem badge)', () => {
    render(
      <BancadaAdmin
        qtdDoresPendentes={0}
        qtdProjetosPendentes={0}
        nome="Admin"
      />,
    )

    // Badge numérico NÃO deve aparecer quando zero
    expect(screen.queryByText(/^0$/)).toBeNull()
  })
})
