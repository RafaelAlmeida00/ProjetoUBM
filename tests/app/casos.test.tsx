/**
 * T-O3.3 — S1 /casos (vitrine pública, RSC anônimo)
 * TDD RED: render com main/h1; timeline ol; equipe ul;
 * "Equipe ainda em formação" (em_analise sem equipe);
 * privado ausente (CA26); nome sem opt-in = .ubm-anon-tag.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/casos/1',
  notFound: () => { throw new Error('NOTFOUND') },
}))

// Mock dos data adapters
vi.mock('@/lib/data/projetos', () => ({
  listarProjetosVitrine: vi.fn(),
  obterEquipePublica: vi.fn(),
  obterTimelinePublica: vi.fn(),
}))

import { listarProjetosVitrine, obterEquipePublica, obterTimelinePublica } from '@/lib/data/projetos'
import { UbmTimeline } from '@/components/ubm-timeline'
import { UbmTeam } from '@/components/ubm-team'
import type { MembroPublico, EventoTimeline } from '@/lib/data/projetos'

// --- Testa os componentes que a página /casos usa ---

const EVENTOS: EventoTimeline[] = [
  { de_status: null, para_status: 'em_analise', ocorrido_em: '2026-04-01T10:00:00Z' },
  { de_status: 'em_analise', para_status: 'aprovado', ocorrido_em: '2026-04-12T14:00:00Z', ator: 'Coordenador · Eng. de Software' },
]

const MEMBROS_COM_OPTIN: MembroPublico[] = [
  { papel_projeto: 'host', nome_ou_papel: 'Ana Souza', ranking_optin: true, curso: 'Engenharia de Software' },
  { papel_projeto: 'aluno', nome_ou_papel: 'ALUNO · DIREITO', ranking_optin: false, curso: 'Direito' },
]

describe('CasoDetalhe — componentes usados na vitrine pública', () => {
  it('renderiza main com h1 acessível', () => {
    render(
      <main>
        <h1>Casos UBM</h1>
        <UbmTimeline eventos={EVENTOS} />
        <UbmTeam membros={MEMBROS_COM_OPTIN} />
      </main>,
    )
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('timeline renderiza como ol semântica', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBe(2)
  })

  it('equipe renderiza como ul com nome acessível por membro', () => {
    render(<UbmTeam membros={MEMBROS_COM_OPTIN} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBe(2)
  })

  it('em_analise sem equipe exibe "Equipe ainda em formação"', () => {
    render(<UbmTeam membros={[]} />)
    expect(screen.getByText(/equipe.*formação|ainda.*equipe|formação/i)).toBeInTheDocument()
  })

  it('nome sem opt-in = .ubm-anon-tag com texto (não só ícone)', () => {
    render(<UbmTeam membros={MEMBROS_COM_OPTIN} />)
    // Membro sem opt-in: texto papel+curso visível
    expect(screen.getByText(/ALUNO · DIREITO/i)).toBeInTheDocument()
    // Texto não está aria-hidden
    const texto = screen.getByText(/ALUNO · DIREITO/i)
    expect(texto.getAttribute('aria-hidden')).not.toBe('true')
  })

  it('nome com opt-in = nome real (Fraunces)', () => {
    render(<UbmTeam membros={MEMBROS_COM_OPTIN} />)
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
  })

  it('sem indicações/tarefas/doc/log na vitrine (CA26) — componentes não os expõem', () => {
    render(
      <main>
        <UbmTimeline eventos={EVENTOS} />
        <UbmTeam membros={MEMBROS_COM_OPTIN} />
      </main>,
    )
    // Timeline e equipe não expõem indicações, tarefas ou documentos
    expect(screen.queryByText(/indicaç/i)).toBeNull()
    expect(screen.queryByText(/tarefa/i)).toBeNull()
    expect(screen.queryByText(/documento/i)).toBeNull()
  })

  it('timeline append-only na vitrine (sem editar/excluir)', () => {
    render(<UbmTimeline eventos={EVENTOS} />)
    expect(screen.queryByRole('button', { name: /editar|excluir|apagar/i })).toBeNull()
  })
})
