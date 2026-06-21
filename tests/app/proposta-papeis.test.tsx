/**
 * T5.3 — SecaoProposta visões CO-COORDENADOR / ALUNO-TERCEIRO / ADMIN
 * RED → GREEN: co-coord sem CTA; aluno só peça lacrada (sem link/documento — CA18);
 * admin com override e SEM botão assinar (CA23/CA26/D5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/dores/dor-1',
}))

const toastSucesso = vi.fn()
const toastErro = vi.fn()
vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: toastSucesso, erro: toastErro, info: vi.fn(), dispensar: vi.fn() }),
}))

vi.mock('@/lib/actions/proposta', () => ({
  enviarProposta: vi.fn().mockResolvedValue({ ok: true }),
  iniciarExecucao: vi.fn().mockResolvedValue({ ok: true }),
  finalizarProjeto: vi.fn().mockResolvedValue({ ok: true }),
  contrapropor: vi.fn().mockResolvedValue({ ok: true }),
  enviarDocumentoAssinado: vi.fn().mockResolvedValue({ ok: true }),
}))

import { SecaoProposta } from '@/components/proposta/SecaoProposta'
import type { DadosProposta } from '@/lib/data/proposta'

const DADOS_COM_DOC: DadosProposta = {
  estadoProjeto: 'proposta_em_analise',
  documentoId: 'doc-1',
  documentoSignedUrl: 'https://storage.example.com/proposta.pdf',
  provaSignedUrl: null,
  statusAssinatura: 'enviada',
  origemAssinatura: 'autentique',
  contraproposta: null,
  nRodadas: 0,
}

const DADOS_APROVADA: DadosProposta = {
  estadoProjeto: 'proposta_aprovada',
  documentoId: 'doc-1',
  documentoSignedUrl: 'https://storage.example.com/proposta.pdf',
  provaSignedUrl: 'https://storage.example.com/prova.pdf',
  statusAssinatura: 'assinada',
  origemAssinatura: 'autentique',
  contraproposta: null,
  nRodadas: 0,
}

beforeEach(() => {
  toastSucesso.mockReset()
  toastErro.mockReset()
})

// ---------------------------------------------------------------------------
// CO-COORDENADOR (CA23)
// ---------------------------------------------------------------------------

describe('T5.3 — Co-coordenador (read-only, sem CTAs)', () => {
  it('exibe msg de acompanhamento (sem CTAs de ação)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="coordenador"
        dados={DADOS_COM_DOC}
      />
    )
    expect(screen.getByTestId('msg-coord')).toBeInTheDocument()
    expect(screen.getByText(/ações de proposta cabem ao host/i)).toBeInTheDocument()
  })

  it('exibe link do documento (pode ver, CA23)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="coordenador"
        dados={DADOS_COM_DOC}
      />
    )
    expect(screen.getByTestId('doc-coord')).toBeInTheDocument()
    // aria-label no anchor é "Baixar documento da proposta"
    expect(screen.getByRole('link', { name: /baixar documento da proposta/i })).toBeInTheDocument()
  })

  it('NÃO exibe nenhum botão de ação (enviar/assinar/contrapropor/iniciar/finalizar)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="coordenador"
        dados={DADOS_COM_DOC}
      />
    )
    // Coordenador não tem nenhum botão — só links de download read-only
    const botoes = screen.queryAllByRole('button')
    expect(botoes).toHaveLength(0)
    // Sem link de assinar
    expect(screen.queryByRole('link', { name: /assinar/i })).not.toBeInTheDocument()
  })

  it('exibe chip de estado (read-only)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="coordenador"
        dados={DADOS_COM_DOC}
      />
    )
    // Chip de estado aparece no header E no corpo do co-coordenador — pelo menos um presente
    const chips = screen.getAllByLabelText(/estado: enviada, aguardando assinatura/i)
    expect(chips.length).toBeGreaterThanOrEqual(1)
  })

  it('exibe prova quando aprovada', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="coordenador"
        dados={DADOS_APROVADA}
      />
    )
    expect(screen.getByTestId('prova-coord')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ALUNO / TERCEIRO (CA18)
// ---------------------------------------------------------------------------

describe('T5.3 — Aluno/terceiro (peça lacrada — CA18)', () => {
  it('exibe peça lacrada com "DOCUMENTO RESTRITO"', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="aluno"
        dados={null}
      />
    )
    expect(screen.getByTestId('peca-lacrada')).toBeInTheDocument()
    expect(screen.getByText(/documento restrito/i)).toBeInTheDocument()
  })

  it('exibe mensagem explicativa (não só "negado")', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="aluno"
        dados={null}
      />
    )
    expect(screen.getByText(/confidencial/i)).toBeInTheDocument()
    expect(screen.getByText(/linha do tempo/i)).toBeInTheDocument()
  })

  it('NUNCA renderiza link de documento (CA18)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="aluno"
        dados={DADOS_APROVADA}
      />
    )
    // Mesmo que dados contenham URL, aluno só vê peça lacrada
    expect(screen.queryByRole('link', { name: /proposta|prova|assinar|baixar/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('ver-documento')).not.toBeInTheDocument()
  })

  it('NUNCA renderiza link mesmo com dados reais passados', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="aluno"
        dados={DADOS_COM_DOC}
      />
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('papel null também exibe peça lacrada', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel={null}
        dados={null}
      />
    )
    expect(screen.getByTestId('peca-lacrada')).toBeInTheDocument()
  })

  it('seção tem aria-label "Documento restrito" na peça lacrada (a11y)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="aluno"
        dados={null}
      />
    )
    expect(screen.getByLabelText(/documento restrito/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ADMIN (CA23/CA26/D5)
// ---------------------------------------------------------------------------

describe('T5.3 — Admin (vê tudo + override auditado, NUNCA assinar — D5)', () => {
  it('exibe documento e estado (admin vê tudo)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="admin"
        dados={DADOS_COM_DOC}
      />
    )
    expect(screen.getByTestId('doc-admin')).toBeInTheDocument()
    // aria-label no anchor é "Baixar documento da proposta"
    expect(screen.getByRole('link', { name: /baixar documento da proposta/i })).toBeInTheDocument()
  })

  it('exibe prova quando aprovada com badge de origem', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="admin"
        dados={DADOS_APROVADA}
      />
    )
    expect(screen.getByTestId('prova-admin')).toBeInTheDocument()
    expect(screen.getByText(/via autentique/i)).toBeInTheDocument()
  })

  it('exibe zona de override auditado colapsada (CA26)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="admin"
        dados={DADOS_COM_DOC}
      />
    )
    expect(screen.getByTestId('override-admin')).toBeInTheDocument()
    expect(screen.getByText(/override auditado/i)).toBeInTheDocument()
  })

  it('NUNCA exibe botão "assinar" para admin (D5)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="admin"
        dados={DADOS_COM_DOC}
      />
    )
    // Admin nunca tem botão/link cujo accessible name seja "assinar"
    // (o texto "assinar" pode aparecer em descrição de texto, mas NUNCA como CTA clicável)
    expect(screen.queryByRole('button', { name: /\bassinar\b/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /\bassinar\b/i })).not.toBeInTheDocument()
  })

  it('override permite anexar prova com motivo (CA26)', async () => {
    const { enviarDocumentoAssinado } = await import('@/lib/actions/proposta')
    ;(enviarDocumentoAssinado as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true })

    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="admin"
        dados={DADOS_COM_DOC}
      />
    )

    // Abre o details de override
    const summary = screen.getByText(/override auditado/i)
    fireEvent.click(summary)

    // Preenche motivo
    const motivoTextarea = screen.getByRole('textbox')
    fireEvent.change(motivoTextarea, { target: { value: 'Representante assinou fora do app.' } })

    // Seleciona PDF
    const inputPdf = screen.getByTestId('input-pdf-override')
    const pdfFile = new File(['pdf'], 'prova.pdf', { type: 'application/pdf' })
    fireEvent.change(inputPdf, { target: { files: [pdfFile] } })

    // Clica em anexar
    fireEvent.click(screen.getByTestId('btn-anexar-prova'))
    await waitFor(() => expect(enviarDocumentoAssinado).toHaveBeenCalled())
  })

  it('exibe motivo da contraproposta para admin (RN19)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="admin"
        dados={{
          ...DADOS_COM_DOC,
          contraproposta: { motivo: 'O prazo está errado.', criadoEm: '2026-06-01T00:00:00Z' },
        }}
      />
    )
    expect(screen.getByTestId('motivo-contraproposta-admin')).toBeInTheDocument()
    expect(screen.getByText(/o prazo está errado/i)).toBeInTheDocument()
  })

  it('exibe alerta de loop para admin (nRodadas >= 3)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="admin"
        dados={{ ...DADOS_COM_DOC, nRodadas: 4 }}
      />
    )
    expect(screen.getByTestId('alerta-loop-admin')).toBeInTheDocument()
  })
})
