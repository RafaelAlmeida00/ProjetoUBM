/**
 * Fase 3 — fluxo de host na UI (ProjetoDetalheClient).
 * Admin ELEGE (sem fechar); host COMPÕE e fecha; admin reabre/troca; remover membro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/projetos/p1',
}))

const { elegerHostMock, trocarHostMock, fecharEquipeMock, reabrirMock, removerMock, avancarMock } = vi.hoisted(() => ({
  elegerHostMock: vi.fn(),
  trocarHostMock: vi.fn(),
  fecharEquipeMock: vi.fn(),
  reabrirMock: vi.fn(),
  removerMock: vi.fn(),
  avancarMock: vi.fn(),
}))

vi.mock('@/lib/actions/equipe', () => ({
  elegerHost: (...a: unknown[]) => elegerHostMock(...a),
  trocarHost: (...a: unknown[]) => trocarHostMock(...a),
  fecharEquipe: (...a: unknown[]) => fecharEquipeMock(...a),
  reabrirIndicacoes: (...a: unknown[]) => reabrirMock(...a),
  removerMembro: (...a: unknown[]) => removerMock(...a),
}))
vi.mock('@/lib/actions/projeto', () => ({ avancarProjeto: (...a: unknown[]) => avancarMock(...a) }))
vi.mock('@/lib/actions/tarefa', () => ({
  criarTarefa: vi.fn(), editarTarefa: vi.fn(), concluirTarefa: vi.fn(), reatribuirTarefa: vi.fn(),
}))

import { ProjetoDetalheClient } from '@/app/app/projetos/[id]/projeto-detalhe-client'

beforeEach(() => {
  elegerHostMock.mockResolvedValue({ ok: true })
  trocarHostMock.mockResolvedValue({ ok: true })
  reabrirMock.mockResolvedValue({ ok: true })
  removerMock.mockResolvedValue({ ok: true })
})

describe('ProjetoDetalheClient — fluxo de host (0060)', () => {
  it('admin em em_analise SEM host: mostra "Eleger host" (não fecha)', () => {
    render(<ProjetoDetalheClient projetoId="p1" indicacoes={[]} papelAtual="admin" projetoStatus="em_analise" hostElected={false} />)
    expect(screen.getByRole('button', { name: /^eleger host$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /trocar host/i })).toBeNull()
  })

  it('admin em em_analise COM host: mostra "Trocar host" + "Fechar equipe (admin)"', () => {
    render(<ProjetoDetalheClient projetoId="p1" indicacoes={[]} papelAtual="admin" projetoStatus="em_analise" hostElected />)
    expect(screen.getByRole('button', { name: /trocar host/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fechar equipe/i })).toBeInTheDocument()
  })

  it('host em em_analise: mostra "Compor equipe e fechar"', () => {
    render(<ProjetoDetalheClient projetoId="p1" indicacoes={[]} papelAtual="host" projetoStatus="em_analise" hostElected />)
    expect(screen.getByRole('button', { name: /compor equipe e fechar/i })).toBeInTheDocument()
  })

  it('admin em aprovado: "Reabrir indicações" chama a action', async () => {
    render(<ProjetoDetalheClient projetoId="p1" indicacoes={[]} papelAtual="admin" projetoStatus="aprovado" hostElected />)
    fireEvent.click(screen.getByRole('button', { name: /reabrir indicações/i }))
    await waitFor(() => expect(reabrirMock).toHaveBeenCalledWith('p1'))
  })

  it('gestão de membros: "Remover" chama removerMembro com o pessoa_id; host e o próprio NÃO aparecem', async () => {
    render(
      <ProjetoDetalheClient
        projetoId="p1"
        indicacoes={[]}
        papelAtual="host"
        projetoStatus="aprovado"
        hostElected
        currentUserId="p-host"
        gestao={[
          { pessoa_id: 'p-host', nome: 'Host Y', papel_projeto: 'host' },
          { pessoa_id: 'p-aluno', nome: 'Aluno X', papel_projeto: 'aluno' },
        ]}
      />,
    )
    // só o aluno é removível (host e o próprio usuário são filtrados)
    const botoes = screen.getAllByRole('button', { name: /remover/i })
    expect(botoes).toHaveLength(1)
    fireEvent.click(botoes[0])
    await waitFor(() => expect(removerMock).toHaveBeenCalledWith('p1', 'p-aluno'))
  })
})
