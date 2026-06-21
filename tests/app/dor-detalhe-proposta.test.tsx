/**
 * T5.4 — DorDetalhe com SecaoProposta substituindo o teaser 006.
 * RED → GREEN: teaser sumiu; seção real renderiza a visão certa por papel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/dores/dor-1',
}))

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: vi.fn(), erro: vi.fn(), info: vi.fn(), dispensar: vi.fn() }),
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDor: vi.fn().mockResolvedValue({ ok: true }),
  editarDor: vi.fn().mockResolvedValue({ ok: true }),
  moderarDor: vi.fn().mockResolvedValue({ ok: true }),
  submeterDorLanding: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/equipe', () => ({
  fecharEquipe: vi.fn().mockResolvedValue({ ok: true }),
  trocarHost: vi.fn().mockResolvedValue({ ok: true }),
  elegerHost: vi.fn().mockResolvedValue({ ok: true }),
  reabrirIndicacoes: vi.fn().mockResolvedValue({ ok: true }),
  encerrarIndicacoes: vi.fn().mockResolvedValue({ ok: true }),
  removerMembro: vi.fn().mockResolvedValue({ ok: true }),
  editarEquipe: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/projeto', () => ({
  avancarProjeto: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/tarefa', () => ({
  criarTarefa: vi.fn().mockResolvedValue({ ok: true }),
  editarTarefa: vi.fn().mockResolvedValue({ ok: true }),
  concluirTarefa: vi.fn().mockResolvedValue({ ok: true }),
  reatribuirTarefa: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/indicacao', () => ({
  indicarSe: vi.fn().mockResolvedValue({ ok: true }),
  retirarIndicacao: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/anexo', () => ({
  removerAnexo: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/actions/proposta', () => ({
  enviarProposta: vi.fn().mockResolvedValue({ ok: true }),
  iniciarExecucao: vi.fn().mockResolvedValue({ ok: true }),
  finalizarProjeto: vi.fn().mockResolvedValue({ ok: true }),
  contrapropor: vi.fn().mockResolvedValue({ ok: true }),
  enviarDocumentoAssinado: vi.fn().mockResolvedValue({ ok: true }),
}))

import { DorDetalhe } from '@/components/dores/DorDetalhe'

const DOR_BASE = {
  id: 'dor-1',
  empresa_nome: 'Prefeitura de Barra Mansa',
  descricao: 'Sistema para automatizar processos administrativos.',
  status: 'publicada' as const,
  cursos: ['sistemas_de_informacao'],
  publicada_em: '2026-01-01T00:00:00Z',
  criada_em: '2025-12-01T00:00:00Z',
  aprovado_por: 'admin-1',
  motivo_rejeicao: null,
  autor_id: 'user-1',
}

beforeEach(() => { vi.clearAllMocks() })

describe('T5.4 — DorDetalhe: teaser 006 substituído por SecaoProposta', () => {
  it('teaser "EM BREVE · 006" NÃO aparece mais', () => {
    render(
      <DorDetalhe
        dor={DOR_BASE}
        currentUserId="user-host"
        isAdmin={false}
        projetoId="proj-1"
        projetoStatus="aguardando_proposta"
        papelAtual="host"
        dadosProposta={{ estadoProjeto: 'aguardando_proposta' }}
        papelProposta="host"
      />
    )
    expect(screen.queryByText(/em breve · 006/i)).not.toBeInTheDocument()
    // O texto literal "EM BREVE" não deve aparecer
    expect(screen.queryByText(/EM BREVE/)).not.toBeInTheDocument()
  })

  it('SecaoProposta aparece (seção "Proposta e assinatura")', () => {
    render(
      <DorDetalhe
        dor={DOR_BASE}
        currentUserId="user-host"
        isAdmin={false}
        projetoId="proj-1"
        projetoStatus="aguardando_proposta"
        papelAtual="host"
        dadosProposta={{ estadoProjeto: 'aguardando_proposta' }}
        papelProposta="host"
      />
    )
    expect(screen.getByTestId('secao-proposta')).toBeInTheDocument()
    expect(screen.getByText('Proposta e assinatura')).toBeInTheDocument()
  })

  it('visão host renderiza zona de envio', () => {
    render(
      <DorDetalhe
        dor={DOR_BASE}
        currentUserId="user-host"
        isAdmin={false}
        projetoId="proj-1"
        projetoStatus="aguardando_proposta"
        papelAtual="host"
        dadosProposta={{ estadoProjeto: 'aguardando_proposta' }}
        papelProposta="host"
      />
    )
    expect(screen.getByTestId('zona-enviar')).toBeInTheDocument()
  })

  it('visão aluno exibe peça lacrada (CA18)', () => {
    render(
      <DorDetalhe
        dor={DOR_BASE}
        currentUserId="user-aluno"
        isAdmin={false}
        projetoId="proj-1"
        projetoStatus="proposta_em_analise"
        papelAtual="aluno"
        dadosProposta={null}
        papelProposta="aluno"
      />
    )
    expect(screen.getByTestId('peca-lacrada')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /proposta|assinar|baixar/i })).not.toBeInTheDocument()
  })

  it('sem projetoId NÃO renderiza a seção de proposta', () => {
    render(
      <DorDetalhe
        dor={DOR_BASE}
        currentUserId="user-1"
        isAdmin={false}
      />
    )
    expect(screen.queryByTestId('secao-proposta')).not.toBeInTheDocument()
  })

  it('visão representante exibe dois caminhos', () => {
    render(
      <DorDetalhe
        dor={DOR_BASE}
        currentUserId="user-rep"
        isAdmin={false}
        projetoId="proj-1"
        projetoStatus="proposta_em_analise"
        papelAtual={null}
        dadosProposta={{
          estadoProjeto: 'proposta_em_analise',
          documentoId: 'doc-1',
          documentoSignedUrl: 'https://storage/proposta.pdf',
          statusAssinatura: 'enviada',
          linkAssinatura: 'https://autentique.com/abc',
          origemAssinatura: 'autentique',
        }}
        papelProposta="representante"
      />
    )
    expect(screen.getByTestId('caminhos-assinatura')).toBeInTheDocument()
    expect(screen.getByTestId('aviso-govbr')).toBeInTheDocument()
  })

  it('visão admin mostra override mas NUNCA botão assinar', () => {
    render(
      <DorDetalhe
        dor={DOR_BASE}
        currentUserId="user-admin"
        isAdmin={true}
        projetoId="proj-1"
        projetoStatus="proposta_em_analise"
        papelAtual="admin"
        dadosProposta={{
          estadoProjeto: 'proposta_em_analise',
          documentoId: 'doc-1',
          documentoSignedUrl: 'https://storage/proposta.pdf',
          statusAssinatura: 'enviada',
          origemAssinatura: 'autentique',
        }}
        papelProposta="admin"
      />
    )
    expect(screen.getByTestId('override-admin')).toBeInTheDocument()
    // Admin nunca tem botão/link cujo accessible name seja "assinar"
    expect(screen.queryByRole('button', { name: /\bassinar\b/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /\bassinar\b/i })).not.toBeInTheDocument()
  })
})
