/**
 * 009 T8/T9/T10 — zona gated no DorDetalhe: Gestão da equipe (host/admin), Indicações recebidas
 * (coord/admin por retorno) e Funções e tarefas (membro/admin; locked p/ não-membro). Colapsadas.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/app/dores/d1' }))
vi.mock('@/lib/actions/dor', () => ({ submeterDor: vi.fn(), editarDor: vi.fn() }))
vi.mock('@/lib/actions/anexo', () => ({ removerAnexo: vi.fn() }))
vi.mock('@/lib/actions/equipe', () => ({
  elegerHost: vi.fn(), trocarHost: vi.fn(), fecharEquipe: vi.fn(), reabrirIndicacoes: vi.fn(), removerMembro: vi.fn(),
}))
vi.mock('@/lib/actions/projeto', () => ({ avancarProjeto: vi.fn() }))
vi.mock('@/lib/actions/tarefa', () => ({ criarTarefa: vi.fn(), editarTarefa: vi.fn(), concluirTarefa: vi.fn(), reatribuirTarefa: vi.fn() }))

import { DorDetalhe } from '@/components/dores/DorDetalhe'
import type { DorData } from '@/components/dores/DorDetalhe'
import type { Indicacao } from '@/lib/data/projetos'

const DOR: DorData = {
  id: 'd1', titulo: 'Automação', empresa_nome: 'Nissan', descricao: 'Dor publicada com detalhes', status: 'publicada',
  cursos: [], autor_id: 'autor-1',
}
const ind = (o: Partial<Indicacao>): Indicacao => ({
  id: 'i1', projeto_id: 'p1', pessoa_id: 'u1', papel_pretendido: 'aluno', mensagem: null,
  created_at: '2026-01-01T00:00:00Z', deleted_at: null, aluno_nome: 'Rafael', aluno_email: 'r@e', curso: 'Eng', ...o,
})

describe('009 DorDetalhe — zona gated (T8/T9/T10)', () => {
  it('admin com projeto → seção "Gestão da equipe" presente', () => {
    render(<DorDetalhe dor={DOR} currentUserId="adm" isAdmin papelAtual="admin" projetoId="p1" projetoStatus="aprovado" hostElected />)
    expect(screen.getByText('Gestão da equipe')).toBeInTheDocument()
  })

  it('aluno NÃO-membro (papelAtual=null) → SEM "Gestão da equipe"; tarefas LOCKED', () => {
    render(<DorDetalhe dor={DOR} currentUserId="alu" isAdmin={false} papelAtual={null} projetoId="p1" projetoStatus="aprovado" />)
    expect(screen.queryByText('Gestão da equipe')).toBeNull()
    expect(screen.getByText(/visíveis apenas aos membros/i)).toBeInTheDocument()
  })

  it('indicacoesGrupos não-vazio → seção "Indicações recebidas"', () => {
    render(
      <DorDetalhe dor={DOR} currentUserId="adm" isAdmin papelAtual="admin" projetoId="p1" projetoStatus="aprovado"
        indicacoesGrupos={[{ projetoId: 'p1', rotulo: 'Automação — Nissan', indicacoes: [ind({})] }]} />,
    )
    expect(screen.getByText('Indicações recebidas')).toBeInTheDocument()
    expect(screen.getByText(/Rafael/)).toBeInTheDocument()
  })

  it('coord-de-outro-curso (indicacoesGrupos=[]) → seção "Indicações recebidas" NÃO aparece (gate por retorno)', () => {
    render(<DorDetalhe dor={DOR} currentUserId="coord" isAdmin={false} papelAtual={null} projetoId="p1" projetoStatus="aprovado" indicacoesGrupos={[]} />)
    expect(screen.queryByText('Indicações recebidas')).toBeNull()
  })

  it('projeto presente → teaser 006 "Proposta e assinatura"', () => {
    render(<DorDetalhe dor={DOR} currentUserId="x" isAdmin={false} papelAtual={null} projetoId="p1" projetoStatus="em_analise" />)
    expect(screen.getByText('Proposta e assinatura')).toBeInTheDocument()
  })

  it('dor SEM projeto → nenhuma zona de gestão/tarefas/006', () => {
    render(<DorDetalhe dor={DOR} currentUserId="x" isAdmin={false} papelAtual={null} projetoId={null} />)
    expect(screen.queryByText('Gestão da equipe')).toBeNull()
    expect(screen.queryByText('Funções e tarefas')).toBeNull()
    expect(screen.queryByText('Proposta e assinatura')).toBeNull()
  })
})
