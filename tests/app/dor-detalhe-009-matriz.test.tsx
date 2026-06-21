/**
 * 009 T11/T12/T13 — ação "Me indicar" no detalhe; vocabulário "dor" (some "projeto"/"Sala da equipe");
 * matriz papel×status (paridade de capacidade).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/app/dores/d1' }))
vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: vi.fn(), erro: vi.fn(), info: vi.fn(), dispensar: vi.fn() }),
}))
vi.mock('@/lib/actions/dor', () => ({ submeterDor: vi.fn(), editarDor: vi.fn() }))
vi.mock('@/lib/actions/anexo', () => ({ removerAnexo: vi.fn() }))
vi.mock('@/lib/actions/indicacao', () => ({ indicarSe: vi.fn(), retirarIndicacao: vi.fn() }))
vi.mock('@/lib/actions/equipe', () => ({ elegerHost: vi.fn(), trocarHost: vi.fn(), fecharEquipe: vi.fn(), reabrirIndicacoes: vi.fn(), removerMembro: vi.fn() }))
vi.mock('@/lib/actions/projeto', () => ({ avancarProjeto: vi.fn() }))
vi.mock('@/lib/actions/tarefa', () => ({ criarTarefa: vi.fn(), editarTarefa: vi.fn(), concluirTarefa: vi.fn(), reatribuirTarefa: vi.fn() }))

import { DorDetalhe } from '@/components/dores/DorDetalhe'
import type { DorData } from '@/components/dores/DorDetalhe'

const DOR: DorData = { id: 'd1', titulo: 'Automação', empresa_nome: 'Nissan', descricao: 'Dor publicada com detalhes', status: 'publicada', cursos: [], autor_id: 'autor-1' }

describe('009 T11 — Me indicar no detalhe', () => {
  it('aluno + em_analise + disponível → botão "Me indicar"', () => {
    render(<DorDetalhe dor={DOR} currentUserId="alu" isAdmin={false} projetoId="p1" projetoStatus="em_analise" papelAtual={null} papelBaseIndicacao="aluno" estadoIndicacao="disponivel" />)
    expect(screen.getByRole('button', { name: /me indicar/i })).toBeInTheDocument()
  })
  it('aprovado → SEM ação "Me indicar"', () => {
    render(<DorDetalhe dor={DOR} currentUserId="alu" isAdmin={false} projetoId="p1" projetoStatus="aprovado" papelAtual={null} papelBaseIndicacao="aluno" />)
    expect(screen.queryByRole('button', { name: /me indicar/i })).toBeNull()
  })
})

describe('009 T12 — vocabulário "dor" (projeto dissolve)', () => {
  it('sem "Sala da equipe" nem "Linha do tempo do projeto"; usa "Andamento"', () => {
    render(<DorDetalhe dor={DOR} currentUserId="x" isAdmin={false} projetoId="p1" projetoStatus="em_analise" papelAtual={null} />)
    expect(screen.queryByText(/sala da equipe/i)).toBeNull()
    expect(screen.queryByText('Linha do tempo do projeto')).toBeNull()
    expect(screen.getByText('Andamento')).toBeInTheDocument()
  })
})

describe('009 T13 — matriz papel×status (paridade)', () => {
  it('host em_analise → Gestão presente; sem Me indicar (host não se indica)', () => {
    render(<DorDetalhe dor={DOR} currentUserId="h" isAdmin={false} projetoId="p1" projetoStatus="em_analise" papelAtual="host" hostElected />)
    expect(screen.getByText('Gestão da equipe')).toBeInTheDocument()
  })
  it('admin aprovado → Gestão + (com grupos) Indicações recebidas', () => {
    render(<DorDetalhe dor={DOR} currentUserId="a" isAdmin papelAtual="admin" projetoId="p1" projetoStatus="aprovado" indicacoesGrupos={[{ projetoId: 'p1', rotulo: 'A — N', indicacoes: [] }].length ? [{ projetoId: 'p1', rotulo: 'A — N', indicacoes: [{ id: 'i', projeto_id: 'p1', pessoa_id: 'u', papel_pretendido: 'aluno', mensagem: null, created_at: '2026-01-01', deleted_at: null, aluno_nome: 'R', aluno_email: 'r@e', curso: 'Eng' }] }] : []} />)
    expect(screen.getByText('Gestão da equipe')).toBeInTheDocument()
    expect(screen.getByText('Indicações recebidas')).toBeInTheDocument()
  })
  it('não-membro → SEM Gestão; tarefas LOCKED; SEM Indicações recebidas', () => {
    render(<DorDetalhe dor={DOR} currentUserId="z" isAdmin={false} papelAtual={null} projetoId="p1" projetoStatus="aprovado" />)
    expect(screen.queryByText('Gestão da equipe')).toBeNull()
    expect(screen.queryByText('Indicações recebidas')).toBeNull()
    expect(screen.getByText(/visíveis apenas aos membros/i)).toBeInTheDocument()
  })
})
