/**
 * Fix-fluxo (bug "janela fechada em todos") — DoresPage indica pelo projeto_id, não pelo dor_id.
 *
 * Causa raiz: o card chamava indicarSe(dor.id), mas a RPC indicar_se(p_projeto_id) checa
 * `projeto.id = p_projeto_id and status='em_analise'`. Como dor.id != projeto.id, o not-exists
 * disparava "janela de indicacao fechada" em TODOS os projetos (mesmo em_analise). Idem para a
 * detecção "já indicado" (vínculos vêm keyed por projeto_id, e eram comparados ao dor_id).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/dores',
}))

const { indicarSeMock, retirarMock } = vi.hoisted(() => ({
  indicarSeMock: vi.fn(),
  retirarMock: vi.fn(),
}))

vi.mock('@/lib/actions/indicacao', () => ({
  indicarSe: (...args: unknown[]) => indicarSeMock(...args),
  retirarIndicacao: (...args: unknown[]) => retirarMock(...args),
}))

import { DoresPage } from '@/components/dores/DoresPage'

// dor.id != projeto_id (espelha a realidade do banco: trigger abre projeto com id próprio)
const DOR = {
  id: 'dor-1',
  empresa_nome: 'Nissan',
  descricao: 'Precisamos de automação de processos industriais.',
  status: 'publicada' as const,
  cursos: [],
  publicada_em: '2026-06-01T00:00:00Z',
  projeto_id: 'proj-1',
  projeto_status: 'em_analise',
}

beforeEach(() => {
  indicarSeMock.mockReset()
  indicarSeMock.mockResolvedValue({ ok: true })
  retirarMock.mockReset()
  retirarMock.mockResolvedValue({ ok: true })
})

describe('DoresPage — indicação usa projeto_id (não dor_id)', () => {
  it('clicar "Me indicar" chama indicarSe com o PROJETO_ID, não o dor_id', async () => {
    render(
      <DoresPage
        doresPublicadas={[DOR]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado
        papelUsuario="aluno"
        vinculosUsuario={{ indicadoProjetoIds: [], membroProjetoIds: [] }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /me indicar/i }))
    await waitFor(() => expect(indicarSeMock).toHaveBeenCalledWith('proj-1', 'aluno'))
    // jamais chamado com o dor_id
    expect(indicarSeMock).not.toHaveBeenCalledWith('dor-1', expect.anything())
  })

  it('"já indicado" é detectado quando indicadoProjetoIds contém o PROJETO_ID', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado
        papelUsuario="aluno"
        vinculosUsuario={{ indicadoProjetoIds: ['proj-1'], membroProjetoIds: [] }}
      />,
    )
    expect(screen.getByText(/você já se indicou/i)).toBeInTheDocument()
  })

  it('vínculo contendo o dor_id por engano NÃO marca "já indicado" (chave é projeto_id)', () => {
    render(
      <DoresPage
        doresPublicadas={[DOR]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado
        papelUsuario="aluno"
        vinculosUsuario={{ indicadoProjetoIds: ['dor-1'], membroProjetoIds: [] }}
      />,
    )
    expect(screen.getByRole('button', { name: /me indicar/i })).toBeInTheDocument()
    expect(screen.queryByText(/você já se indicou/i)).toBeNull()
  })
})
