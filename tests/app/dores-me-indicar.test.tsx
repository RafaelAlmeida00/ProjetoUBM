/**
 * Onda 2 — B6: DorCardItem refatorado (article + link overlay) + MeIndicarSlot
 * RED: falha até MeIndicarSlot e a refatoração do card existirem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/dores',
}))

// ── (1) MeIndicarSlot ────────────────────────────────────────────────────────

const indicarSeMock = vi.fn().mockResolvedValue({ ok: true })
const retirarIndicacaoMock = vi.fn().mockResolvedValue({ ok: true })

describe('B6 — MeIndicarSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    indicarSeMock.mockResolvedValue({ ok: true })
    retirarIndicacaoMock.mockResolvedValue({ ok: true })
  })

  it('MeIndicarSlot existe e pode ser importado', async () => {
    const mod = await import('@/components/dores/MeIndicarSlot')
    expect(mod.MeIndicarSlot).toBeDefined()
  })

  it('estado "disponivel" renderiza botão "Me indicar"', async () => {
    const { MeIndicarSlot } = await import('@/components/dores/MeIndicarSlot')
    render(
      <MeIndicarSlot
        dorId="proj-1"
        empresaNome="Nissan"
        papelBase="aluno"
        estado="disponivel"
        onIndicar={indicarSeMock}
        onRetirar={retirarIndicacaoMock}
      />
    )
    expect(screen.getByRole('button', { name: /me indicar/i })).toBeInTheDocument()
  })

  it('estado "ja_indicado" renderiza chip + botão Retirar', async () => {
    const { MeIndicarSlot } = await import('@/components/dores/MeIndicarSlot')
    render(
      <MeIndicarSlot
        dorId="proj-1"
        empresaNome="Nissan"
        papelBase="aluno"
        estado="ja_indicado"
        onIndicar={indicarSeMock}
        onRetirar={retirarIndicacaoMock}
      />
    )
    expect(screen.getByText(/você já se indicou/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retirar/i })).toBeInTheDocument()
  })

  it('estado "ja_membro" renderiza chip "VOCÊ É DA EQUIPE" sem botão', async () => {
    const { MeIndicarSlot } = await import('@/components/dores/MeIndicarSlot')
    render(
      <MeIndicarSlot
        dorId="proj-1"
        empresaNome="Nissan"
        papelBase="aluno"
        estado="ja_membro"
        onIndicar={indicarSeMock}
        onRetirar={retirarIndicacaoMock}
      />
    )
    expect(screen.getByText(/você é da equipe/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('estado "coord_pendente" renderiza nada (silêncio)', async () => {
    const { MeIndicarSlot } = await import('@/components/dores/MeIndicarSlot')
    const { container } = render(
      <MeIndicarSlot
        dorId="proj-1"
        empresaNome="Nissan"
        papelBase="coordenador"
        estado="coord_pendente"
        onIndicar={indicarSeMock}
        onRetirar={retirarIndicacaoMock}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('estado "nao_verificado" renderiza link de verificação (sem botão)', async () => {
    const { MeIndicarSlot } = await import('@/components/dores/MeIndicarSlot')
    render(
      <MeIndicarSlot
        dorId="proj-1"
        empresaNome="Nissan"
        papelBase="aluno"
        estado="nao_verificado"
        onIndicar={indicarSeMock}
        onRetirar={retirarIndicacaoMock}
      />
    )
    expect(screen.getByRole('link')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('clicar "Me indicar" chama onIndicar e transiciona para ja_indicado', async () => {
    const { MeIndicarSlot } = await import('@/components/dores/MeIndicarSlot')
    render(
      <MeIndicarSlot
        dorId="proj-1"
        empresaNome="Nissan"
        papelBase="aluno"
        estado="disponivel"
        onIndicar={indicarSeMock}
        onRetirar={retirarIndicacaoMock}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /me indicar/i }))
    await waitFor(() => {
      expect(indicarSeMock).toHaveBeenCalledWith('proj-1', 'aluno')
    })
    await waitFor(() => {
      expect(screen.getByText(/você já se indicou/i)).toBeInTheDocument()
    })
  })

  it('clicar "Retirar" chama onRetirar e transiciona para disponivel', async () => {
    const { MeIndicarSlot } = await import('@/components/dores/MeIndicarSlot')
    render(
      <MeIndicarSlot
        dorId="proj-1"
        empresaNome="Nissan"
        papelBase="aluno"
        estado="ja_indicado"
        onIndicar={indicarSeMock}
        onRetirar={retirarIndicacaoMock}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /retirar/i }))
    await waitFor(() => {
      expect(retirarIndicacaoMock).toHaveBeenCalledWith('proj-1')
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /me indicar/i })).toBeInTheDocument()
    })
  })

  it('erro em onIndicar exibe role="alert"', async () => {
    indicarSeMock.mockResolvedValueOnce({ ok: false, error: 'Falha' })
    const { MeIndicarSlot } = await import('@/components/dores/MeIndicarSlot')
    render(
      <MeIndicarSlot
        dorId="proj-1"
        empresaNome="Nissan"
        papelBase="aluno"
        estado="disponivel"
        onIndicar={indicarSeMock}
        onRetirar={retirarIndicacaoMock}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /me indicar/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})

// ── (2) DorCardItem refatorado (article + link overlay) ──────────────────────

import { DoresPage } from '@/components/dores/DoresPage'

const DOR_PUBLICADA = {
  id: 'dor-pub-1',
  empresa_nome: 'Nissan do Brasil',
  descricao: 'Precisamos de ajuda com automação',
  status: 'publicada' as const,
  cursos: ['engenharia_de_software'],
  publicada_em: '2026-06-01T00:00:00Z',
}

describe('B6 — DorCardItem como article (não mais Link raiz)', () => {
  it('card renderiza como <article> e não como <a> envolvendo tudo', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    // O card deve ser article, não um <a> raiz
    expect(document.querySelector('article.ubm-dor-card')).toBeInTheDocument()
    // A navegação fica no link do título, não envolvendo tudo
    const link = document.querySelector('a.ubm-dor-card-link')
    expect(link).toBeInTheDocument()
    expect(link?.getAttribute('href')).toContain('/app/dores/dor-pub-1')
  })

  it('card NÃO renderiza botão "Me indicar" sem papelUsuario (fail-safe)', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    // Sem papelUsuario/vinculosUsuario: NÃO renderiza botão "Me indicar" (fail-safe)
    expect(screen.queryByRole('button', { name: /me indicar/i })).toBeNull()
  })

  it('card renderiza botão "Me indicar" para aluno disponivel', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={true}
        papelUsuario="aluno"
        vinculosUsuario={{ indicadoProjetoIds: [], membroProjetoIds: [] }}
      />
    )
    expect(screen.getByRole('button', { name: /me indicar/i })).toBeInTheDocument()
  })

  it('card renderiza chip "VOCÊ JÁ SE INDICOU" para aluno já indicado', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={true}
        papelUsuario="aluno"
        vinculosUsuario={{ indicadoProjetoIds: ['dor-pub-1'], membroProjetoIds: [] }}
      />
    )
    expect(screen.getByText(/você já se indicou/i)).toBeInTheDocument()
  })

  it('representante NÃO vê botão "Me indicar" na aba vitrine', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_PUBLICADA]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={true}
        papelUsuario="representante"
        vinculosUsuario={{ indicadoProjetoIds: [], membroProjetoIds: [] }}
      />
    )
    expect(screen.queryByRole('button', { name: /me indicar/i })).toBeNull()
  })
})

// ── (3) ADR-0002 Q1 — Selo de estágio no card da vitrine /dores ──────────────

describe('ADR-0002 Q1 — EstagioSelo no card da vitrine', () => {
  const DOR_COM_PROJETO_ATIVO = {
    ...DOR_PUBLICADA,
    projeto_status: 'em_analise',
  }
  const DOR_COM_PROJETO_FINALIZADO = {
    ...DOR_PUBLICADA,
    id: 'dor-pub-2',
    projeto_status: 'finalizado',
  }
  const DOR_SEM_PROJETO = {
    ...DOR_PUBLICADA,
    id: 'dor-pub-3',
    projeto_status: undefined,
  }

  it('card com projeto ativo exibe chip "VIROU CASO" (.ubm-status--caso)', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={[DOR_COM_PROJETO_ATIVO]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(screen.getByText(/virou caso/i)).toBeInTheDocument()
    expect(container.querySelector('.ubm-status--caso')).not.toBeNull()
  })

  it('card com projeto finalizado exibe chip "FINALIZADO" (.ubm-status--finalizado)', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={[DOR_COM_PROJETO_FINALIZADO]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(screen.getByText(/finalizado/i)).toBeInTheDocument()
    expect(container.querySelector('.ubm-status--finalizado')).not.toBeNull()
  })

  it('card sem projeto NÃO exibe nenhum selo de estágio', () => {
    const { container } = render(
      <DoresPage
        doresPublicadas={[DOR_SEM_PROJETO]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />
    )
    expect(container.querySelector('.ubm-status--caso')).toBeNull()
    expect(container.querySelector('.ubm-status--finalizado')).toBeNull()
  })

  it('selo não quebra o layout quando coexiste com MeIndicarSlot (aluno disponivel)', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR_COM_PROJETO_ATIVO]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={true}
        papelUsuario="aluno"
        vinculosUsuario={{ indicadoProjetoIds: [], membroProjetoIds: [] }}
      />
    )
    // Ambos devem coexistir
    expect(screen.getByText(/virou caso/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /me indicar/i })).toBeInTheDocument()
  })
})
