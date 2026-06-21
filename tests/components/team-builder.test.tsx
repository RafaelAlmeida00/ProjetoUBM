/**
 * T-O3.5 — Componente UbmTeamBuilder (.ubm-team-builder)
 * TDD RED: foco preso/ESC fecha/Enter confirma (só com host válido);
 * rádio host aria-describedby, habilitado só p/ coord;
 * erros tipados PT-BR inline sem perder seleção (CA11/CA12).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/projetos/1',
}))

vi.mock('@/lib/actions/equipe', () => ({
  fecharEquipe: vi.fn(),
  trocarHost: vi.fn(),
}))

import { UbmTeamBuilder } from '@/components/ubm-team-builder'
import type { Indicacao } from '@/lib/data/projetos'

const INDICACAO_COORD: Indicacao = {
  id: 'ind-coord-1',
  projeto_id: 'proj-1',
  pessoa_id: 'user-coord-1',
  papel_pretendido: 'coordenador',
  mensagem: null,
  created_at: '2026-04-01T10:00:00Z',
  deleted_at: null,
}

const INDICACAO_ALUNO: Indicacao = {
  id: 'ind-aluno-1',
  projeto_id: 'proj-1',
  pessoa_id: 'user-aluno-1',
  papel_pretendido: 'aluno',
  mensagem: null,
  created_at: '2026-04-02T10:00:00Z',
  deleted_at: null,
}

const mockOnFechar = vi.fn()
const mockOnConfirmar = vi.fn()

beforeEach(() => {
  mockOnFechar.mockReset()
  mockOnConfirmar.mockReset()
  mockOnConfirmar.mockResolvedValue({ ok: true })
})

function renderBuilder(indicacoes = [INDICACAO_COORD, INDICACAO_ALUNO]) {
  return render(
    <UbmTeamBuilder
      projetoId="proj-1"
      indicacoes={indicacoes}
      onFechar={mockOnFechar}
      onConfirmar={mockOnConfirmar}
      nomesIndicados={{
        'user-coord-1': 'Ana Coordenadora',
        'user-aluno-1': 'João Aluno',
      }}
    />,
  )
}

describe('UbmTeamBuilder — T-O3.5', () => {
  it('renderiza como dialog com aria-modal', () => {
    renderBuilder()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('ESC fecha o modal (onFechar chamado)', () => {
    renderBuilder()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockOnFechar).toHaveBeenCalled()
  })

  it('lista indicados com checkbox por membro', () => {
    renderBuilder()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
  })

  it('rádio de host só habilitado para coordenadores selecionados', () => {
    renderBuilder()
    // Seleciona o coordenador
    const checkboxCoord = screen.getByLabelText(/Ana Coordenadora/i)
    fireEvent.click(checkboxCoord)

    // Agora deve aparecer rádio de host para o coord
    const radioHost = screen.getByRole('radio', { name: /Eleger Ana Coordenadora como host/i })
    expect(radioHost).toBeInTheDocument()
    expect(radioHost).not.toBeDisabled()
  })

  it('aluno não tem rádio de host mesmo quando selecionado', () => {
    renderBuilder()
    // Seleciona o aluno
    const checkboxAluno = screen.getByLabelText(/João Aluno/i)
    fireEvent.click(checkboxAluno)

    // Não deve aparecer rádio de host para o aluno
    expect(screen.queryByRole('radio', { name: /Eleger João Aluno como host/i })).toBeNull()
  })

  it('rádio de host tem aria-describedby apontando para restrição', () => {
    renderBuilder()
    const checkboxCoord = screen.getByLabelText(/Ana Coordenadora/i)
    fireEvent.click(checkboxCoord)

    const radioHost = screen.getByRole('radio', { name: /Eleger Ana Coordenadora como host/i })
    // O label do radio deve estar dentro de um elemento com aria-describedby
    const labelEl = radioHost.closest('label')
    expect(labelEl).toHaveAttribute('aria-describedby', 'host-restricao')
  })

  it('erro "Escolha exatamente um host" ao confirmar sem host — sem perder seleção', async () => {
    renderBuilder()
    // Seleciona membro mas não elege host
    const checkboxCoord = screen.getByLabelText(/Ana Coordenadora/i)
    fireEvent.click(checkboxCoord)

    // Tenta confirmar sem host
    const btnConfirmar = screen.getByRole('button', { name: /Confirmar equipe/i })
    fireEvent.click(btnConfirmar)

    // Erro inline
    expect(await screen.findByRole('alert')).toHaveTextContent(/host/i)
    // Seleção mantida
    expect(checkboxCoord).toBeChecked()
  })

  it('erro "O host deve ser um coordenador indicado" se host não é coord', async () => {
    // Cena: só aluno e tentamos forçar host (não deveria acontecer pela UI, mas testamos a validação)
    renderBuilder([INDICACAO_ALUNO])
    // Com só aluno na lista, não há rádio de host — confirmar deve falhar
    const btnConfirmar = screen.getByRole('button', { name: /Confirmar equipe/i })
    fireEvent.click(btnConfirmar)
    expect(await screen.findByRole('alert')).toHaveTextContent(/host/i)
  })

  it('exibe erro "Já existe um host" mapeado do servidor sem perder seleção', async () => {
    mockOnConfirmar.mockResolvedValueOnce({ ok: false, error: 'Já existe um host ativo neste projeto.' })
    renderBuilder()

    const checkboxCoord = screen.getByLabelText(/Ana Coordenadora/i)
    fireEvent.click(checkboxCoord)
    const radioHost = screen.getByRole('radio', { name: /Eleger Ana Coordenadora como host/i })
    fireEvent.click(radioHost)

    const btnConfirmar = screen.getByRole('button', { name: /Confirmar equipe/i })
    fireEvent.click(btnConfirmar)

    expect(await screen.findByRole('alert')).toHaveTextContent(/host/i)
    // Seleção mantida
    expect(checkboxCoord).toBeChecked()
  })

  it('onConfirmar chamado com dados corretos ao confirmar com host válido', async () => {
    renderBuilder()

    const checkboxCoord = screen.getByLabelText(/Ana Coordenadora/i)
    fireEvent.click(checkboxCoord)
    const radioHost = screen.getByRole('radio', { name: /Eleger Ana Coordenadora como host/i })
    fireEvent.click(radioHost)

    const btnConfirmar = screen.getByRole('button', { name: /Confirmar equipe/i })
    fireEvent.click(btnConfirmar)

    await waitFor(() => expect(mockOnConfirmar).toHaveBeenCalled())
    const [projetoId, hostId] = mockOnConfirmar.mock.calls[0]
    expect(projetoId).toBe('proj-1')
    expect(hostId).toBe('user-coord-1')
  })

  it('botão Cancelar chama onFechar', () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }))
    expect(mockOnFechar).toHaveBeenCalled()
  })

  it('resumo reflete quantidade de selecionados e host', () => {
    renderBuilder()
    const checkboxCoord = screen.getByLabelText(/Ana Coordenadora/i)
    fireEvent.click(checkboxCoord)

    expect(screen.getByText(/1 membro/i)).toBeInTheDocument()
  })
})

// ── Fluxo 0060: HOST compõe (host JÁ eleito pelo admin) ─────────────────────────
// Quando há host eleito (hostPessoaId setado), o builder NÃO pode oferecer eleição de host
// (só admin elege/troca) nem listar quem JÁ é membro (incl. o próprio host) como selecionável.
describe('UbmTeamBuilder — host compõe (host já eleito, fluxo 0060)', () => {
  const INDICACAO_ALUNO_2: Indicacao = {
    id: 'ind-aluno-2', projeto_id: 'proj-1', pessoa_id: 'user-aluno-2',
    papel_pretendido: 'aluno', mensagem: null, created_at: '2026-04-03T10:00:00Z', deleted_at: null,
  }
  const INDICACAO_COORD_2: Indicacao = {
    id: 'ind-coord-2', projeto_id: 'proj-1', pessoa_id: 'user-coord-2',
    papel_pretendido: 'coordenador', mensagem: null, created_at: '2026-04-04T10:00:00Z', deleted_at: null,
  }

  function renderHostFixo() {
    // user-coord-1 = host eleito (já membro); user-aluno-2 = já membro (add pelo admin).
    // Selecionáveis devem sobrar só: user-aluno-1 e user-coord-2.
    return render(
      <UbmTeamBuilder
        projetoId="proj-1"
        indicacoes={[INDICACAO_COORD, INDICACAO_ALUNO, INDICACAO_ALUNO_2, INDICACAO_COORD_2]}
        hostPessoaId="user-coord-1"
        membrosExistentes={['user-coord-1', 'user-aluno-2']}
        onFechar={mockOnFechar}
        onConfirmar={mockOnConfirmar}
        nomesIndicados={{
          'user-coord-1': 'Ana Coordenadora', 'user-aluno-1': 'João Aluno',
          'user-aluno-2': 'Maria Aluna', 'user-coord-2': 'Bruno Coord',
        }}
      />,
    )
  }

  it('NÃO mostra nenhum rádio de host (host fixo — só admin elege)', () => {
    renderHostFixo()
    // seleciona o coordenador disponível
    fireEvent.click(screen.getByLabelText(/Bruno Coord/i))
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('exclui o host e quem JÁ é membro da lista de selecionáveis', () => {
    renderHostFixo()
    // host (Ana) e já-membro (Maria) não aparecem; disponíveis sim
    expect(screen.queryByLabelText(/Selecionar Ana Coordenadora/i)).toBeNull()
    expect(screen.queryByLabelText(/Selecionar Maria Aluna/i)).toBeNull()
    expect(screen.getByLabelText(/Selecionar João Aluno/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Selecionar Bruno Coord/i)).toBeInTheDocument()
  })

  it('confirma SEM precisar eleger host: onConfirmar recebe o host já eleito', async () => {
    renderHostFixo()
    fireEvent.click(screen.getByLabelText(/Selecionar João Aluno/i))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar equipe/i }))
    await waitFor(() => expect(mockOnConfirmar).toHaveBeenCalled())
    const [projetoId, hostId, membros] = mockOnConfirmar.mock.calls[0]
    expect(projetoId).toBe('proj-1')
    expect(hostId).toBe('user-coord-1') // host eleito, não escolhido na UI
    // membros enviados = só os novos selecionados (host e já-membros não reentram)
    expect(membros.map((m: { pessoaId: string }) => m.pessoaId)).toEqual(['user-aluno-1'])
  })

  it('título indica composição (não "eleger host")', () => {
    renderHostFixo()
    expect(screen.getByRole('heading')).toHaveTextContent(/compor equipe/i)
    expect(screen.queryByText(/eleger host/i)).toBeNull()
  })
})
