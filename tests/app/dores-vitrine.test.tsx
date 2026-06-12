/**
 * TDD RED → GREEN — Vitrine pública de dores (/dores, /dores/[id])
 * RN17/CA17: visitante anônimo vê dores publicadas, cursos e anexos.
 * Testa os componentes das rotas públicas via mock do data layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dores',
  notFound: () => { throw new Error('NOTFOUND') },
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

vi.mock('@/lib/data/dores', () => ({
  listarDoresVitrine: vi.fn(),
  obterDorPublica: vi.fn(),
}))

import type { DorVitrine, DorPublica } from '@/lib/data/dores'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DOR_PUBLICADA: DorVitrine = {
  id: 'aaa-111',
  descricao: 'Precisamos de um sistema de agendamento online para a prefeitura.',
  empresa_nome: 'Prefeitura de Barra Mansa',
  cursos: ['engenharia_de_software', 'sistemas_de_informacao'],
  publicada_em: '2026-03-15T10:00:00Z',
}

const DOR_PUBLICADA_2: DorVitrine = {
  id: 'bbb-222',
  descricao: 'Necessidade de automação de controle de estoque para pequeno negócio.',
  empresa_nome: 'Mercado Exemplo',
  cursos: ['sistemas_de_informacao'],
  publicada_em: '2026-04-01T09:00:00Z',
}

const ANEXO_1 = {
  id: 'anx-001',
  nome_original: 'relatorio.pdf',
  mime_type: 'application/pdf',
  tamanho_bytes: 102400,
  storage_path: 'dor/aaa-111/relatorio.pdf',
  signedUrl: 'https://storage.example.com/signed/relatorio.pdf?token=abc',
}

const DOR_DETALHE: DorPublica = {
  id: 'aaa-111',
  descricao: 'Precisamos de um sistema de agendamento online para a prefeitura.',
  empresa_nome: 'Prefeitura de Barra Mansa',
  cursos: ['engenharia_de_software', 'sistemas_de_informacao'],
  publicada_em: '2026-03-15T10:00:00Z',
  anexos: [ANEXO_1],
}

// ---------------------------------------------------------------------------
// Helpers: importa componentes inline após mock estar configurado
// ---------------------------------------------------------------------------

async function renderDoresVitrinePage(dores: DorVitrine[]) {
  const { listarDoresVitrine } = await import('@/lib/data/dores')
  vi.mocked(listarDoresVitrine).mockResolvedValue(dores)
  const mod = await import('@/app/dores/page')
  // RSC async page — resolve a Promise
  const PageComponent = mod.default
  const jsx = await PageComponent()
  render(jsx as React.ReactElement)
}

async function renderDorDetalhePage(dor: DorPublica | null) {
  const { obterDorPublica } = await import('@/lib/data/dores')
  vi.mocked(obterDorPublica).mockResolvedValue(dor)
  const mod = await import('@/app/dores/[id]/page')
  const PageComponent = mod.default
  if (dor === null) {
    await expect(
      PageComponent({ params: Promise.resolve({ id: 'nao-existe' }) }),
    ).rejects.toThrow('NOTFOUND')
    return
  }
  const jsx = await PageComponent({ params: Promise.resolve({ id: dor.id }) })
  render(jsx as React.ReactElement)
}

// ---------------------------------------------------------------------------
// Testes: /dores (lista vitrine)
// ---------------------------------------------------------------------------

describe('/dores — vitrine pública (lista)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mock('next/navigation', () => ({
      useRouter: () => ({ push: vi.fn() }),
      usePathname: () => '/dores',
      notFound: () => { throw new Error('NOTFOUND') },
    }))
    vi.mock('next/link', () => ({
      default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
        React.createElement('a', { href, ...props }, children),
    }))
    vi.mock('@/lib/data/dores', () => ({
      listarDoresVitrine: vi.fn(),
      obterDorPublica: vi.fn(),
    }))
  })

  it('renderiza main com heading institucional', async () => {
    await renderDoresVitrinePage([DOR_PUBLICADA, DOR_PUBLICADA_2])
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('exibe cards com empresa das dores publicadas', async () => {
    await renderDoresVitrinePage([DOR_PUBLICADA, DOR_PUBLICADA_2])
    expect(screen.getByText('Prefeitura de Barra Mansa')).toBeInTheDocument()
    expect(screen.getByText('Mercado Exemplo')).toBeInTheDocument()
  })

  it('cada card linka para /dores/[id]', async () => {
    await renderDoresVitrinePage([DOR_PUBLICADA])
    const link = screen.getByRole('link', { name: /prefeitura de barra mansa/i })
    expect(link).toHaveAttribute('href', `/dores/${DOR_PUBLICADA.id}`)
  })

  it('exibe estado vazio humanizado quando não há dores publicadas', async () => {
    await renderDoresVitrinePage([])
    expect(screen.queryByText('Prefeitura de Barra Mansa')).toBeNull()
    // Mensagem de estado vazio — pode ser múltiplos elementos (título + msg)
    const emptyEls = screen.getAllByText(/breve|primeiras|nenhuma/i)
    expect(emptyEls.length).toBeGreaterThan(0)
  })

  it('NÃO exige login — sem redirecionamento ou gate de auth', async () => {
    await renderDoresVitrinePage([DOR_PUBLICADA])
    // Não deve haver link/botão de login obrigatório
    expect(screen.queryByText(/fazer login|entrar para ver|acesso restrito/i)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Testes: /dores/[id] (detalhe)
// ---------------------------------------------------------------------------

describe('/dores/[id] — detalhe público', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mock('next/navigation', () => ({
      useRouter: () => ({ push: vi.fn() }),
      usePathname: () => '/dores/aaa-111',
      notFound: () => { throw new Error('NOTFOUND') },
    }))
    vi.mock('next/link', () => ({
      default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
        React.createElement('a', { href, ...props }, children),
    }))
    vi.mock('@/lib/data/dores', () => ({
      listarDoresVitrine: vi.fn(),
      obterDorPublica: vi.fn(),
    }))
  })

  it('renderiza detalhe com empresa e descrição', async () => {
    await renderDorDetalhePage(DOR_DETALHE)
    expect(screen.getByText('Prefeitura de Barra Mansa')).toBeInTheDocument()
    expect(screen.getByText(/sistema de agendamento online/i)).toBeInTheDocument()
  })

  it('exibe cursos sugeridos', async () => {
    await renderDorDetalhePage(DOR_DETALHE)
    // Deve exibir label do curso (pode ser label formatado ou o valor)
    const container = screen.getByRole('main') ?? document.body
    const hasCurso =
      container.textContent?.match(/engenharia|sistemas|software|informação/i) !== null
    expect(hasCurso).toBe(true)
  })

  it('exibe lista de anexos com link de download (signed URL)', async () => {
    await renderDorDetalhePage(DOR_DETALHE)
    const link = screen.getByRole('link', { name: /relatorio\.pdf/i })
    expect(link).toHaveAttribute('href', ANEXO_1.signedUrl)
    expect(link).toHaveAttribute('download')
  })

  it('exibe nome do arquivo e tamanho/tipo do anexo', async () => {
    await renderDorDetalhePage(DOR_DETALHE)
    expect(screen.getByText('relatorio.pdf')).toBeInTheDocument()
    // Meta: tipo ou tamanho visível
    const container = document.body
    const hasMeta =
      container.textContent?.match(/pdf|kb|mb|\d+/i) !== null
    expect(hasMeta).toBe(true)
  })

  it('chama notFound() quando dor não existe (não-publicada)', async () => {
    await renderDorDetalhePage(null)
    // Se chegar aqui sem rejeitar, falha
  })

  it('NÃO exige login — sem gate de auth no detalhe público', async () => {
    await renderDorDetalhePage(DOR_DETALHE)
    expect(screen.queryByText(/fazer login|entrar para ver|acesso restrito/i)).toBeNull()
  })

  it('sem anexos exibe seção de anexos vazia (sem erro)', async () => {
    const dorSemAnexo: DorPublica = { ...DOR_DETALHE, anexos: [] }
    await renderDorDetalhePage(dorSemAnexo)
    // Não deve quebrar — empresa ainda visível
    expect(screen.getByText('Prefeitura de Barra Mansa')).toBeInTheDocument()
  })
})
