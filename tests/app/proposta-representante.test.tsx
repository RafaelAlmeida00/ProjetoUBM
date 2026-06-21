/**
 * T5.2 — SecaoProposta visão REPRESENTANTE
 * RED → GREEN: ambos caminhos visíveis; aviso pró-gov.br presente com 2 links externos;
 * contrapropor sem motivo → erro inline (CA11); upload só PDF.
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

const enviarPropostaMock = vi.fn()
const iniciarExecucaoMock = vi.fn()
const finalizarProjetoMock = vi.fn()
const contrapropMock = vi.fn()
const enviarAssinadoMock = vi.fn()

vi.mock('@/lib/actions/proposta', () => ({
  enviarProposta: (...a: unknown[]) => enviarPropostaMock(...a),
  iniciarExecucao: (...a: unknown[]) => iniciarExecucaoMock(...a),
  finalizarProjeto: (...a: unknown[]) => finalizarProjetoMock(...a),
  contrapropor: (...a: unknown[]) => contrapropMock(...a),
  enviarDocumentoAssinado: (...a: unknown[]) => enviarAssinadoMock(...a),
}))

import { SecaoProposta } from '@/components/proposta/SecaoProposta'
import type { DadosProposta } from '@/lib/data/proposta'

const DADOS_PENDENTE: DadosProposta = {
  estadoProjeto: 'proposta_em_analise',
  documentoId: 'doc-1',
  documentoSignedUrl: 'https://storage.example.com/proposta.pdf',
  statusAssinatura: 'enviada',
  linkAssinatura: 'https://autentique.com/assinar/abc123',
  provedorDocId: 'autentique-123',
  origemAssinatura: 'autentique',
}

beforeEach(() => {
  toastSucesso.mockReset()
  toastErro.mockReset()
  contrapropMock.mockResolvedValue({ ok: true })
  enviarAssinadoMock.mockResolvedValue({ ok: true })
  enviarPropostaMock.mockResolvedValue({ ok: true })
  iniciarExecucaoMock.mockResolvedValue({ ok: true })
  finalizarProjetoMock.mockResolvedValue({ ok: true })
})

describe('T5.2 — Representante — dois caminhos visíveis (RN7b)', () => {
  it('exibe Caminho A e Caminho B lado a lado', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    expect(screen.getByTestId('caminhos-assinatura')).toBeInTheDocument()
    expect(screen.getByTestId('caminho-a')).toBeInTheDocument()
    expect(screen.getByTestId('caminho-b')).toBeInTheDocument()
  })

  it('Caminho B NÃO está escondido (visível sem necessidade de ação no A primeiro)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    // Caminho B deve estar imediatamente visível (não atrás de um toggle/tab)
    const caminhoB = screen.getByTestId('caminho-b')
    expect(caminhoB).toBeVisible()
  })

  it('Caminho A exibe link de assinatura do Autentique', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    const linkA = screen.getByRole('link', { name: /assinar via autentique/i })
    expect(linkA).toBeInTheDocument()
    expect(linkA).toHaveAttribute('href', 'https://autentique.com/assinar/abc123')
    expect(linkA).toHaveAttribute('target', '_blank')
    expect(linkA).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('T5.2 — Representante — aviso pró-gov.br (RN7c)', () => {
  it('exibe aviso gov.br no Caminho B', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    expect(screen.getByTestId('aviso-govbr')).toBeInTheDocument()
    expect(screen.getByText(/recomendamos assinar pelo/i)).toBeInTheDocument()
  })

  it('aviso gov.br tem DOIS links externos (gov.br + validar.gov.br)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    const linkGov = screen.getByRole('link', { name: /assinar no gov\.br/i })
    const linkValidar = screen.getByRole('link', { name: /validar documento em validar\.gov\.br/i })
    expect(linkGov).toBeInTheDocument()
    expect(linkGov).toHaveAttribute('target', '_blank')
    expect(linkValidar).toBeInTheDocument()
    expect(linkValidar).toHaveAttribute('target', '_blank')
  })
})

describe('T5.2 — Representante — contraproposta (CA11/RN14)', () => {
  it('exibe botão contrapropor', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    expect(screen.getByTestId('btn-contrapropor')).toBeInTheDocument()
  })

  it('abre modal ao clicar em contrapropor', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    fireEvent.click(screen.getByTestId('btn-contrapropor'))
    expect(await screen.findByRole('dialog', { name: /contraproposta/i })).toBeInTheDocument()
  })

  it('contrapropor sem motivo → erro inline (CA11)', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    fireEvent.click(screen.getByTestId('btn-contrapropor'))
    await screen.findByRole('dialog', { name: /contraproposta/i })
    fireEvent.click(screen.getByRole('button', { name: /devolver com motivo/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/motivo é obrigatório/i)).toBeInTheDocument()
    })
    expect(contrapropMock).not.toHaveBeenCalled()
  })

  it('contrapropor COM motivo chama action e dispara toast sucesso', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    fireEvent.click(screen.getByTestId('btn-contrapropor'))
    await screen.findByRole('dialog', { name: /contraproposta/i })
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'O prazo precisa ser ajustado.' } })
    fireEvent.click(screen.getByRole('button', { name: /devolver com motivo/i }))
    await waitFor(() => expect(contrapropMock).toHaveBeenCalledWith(expect.objectContaining({
      projetoId: 'proj-1',
      motivo: 'O prazo precisa ser ajustado.',
    })))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalled())
  })

  it('ESC fecha o modal de contraproposta', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    fireEvent.click(screen.getByTestId('btn-contrapropor'))
    await screen.findByRole('dialog', { name: /contraproposta/i })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /contraproposta/i })).not.toBeInTheDocument()
    })
  })
})

describe('T5.2 — Representante — upload Caminho B (CA24)', () => {
  it('upload de arquivo não-PDF exibe erro inline', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    const input = screen.getByTestId('input-pdf-assinado')
    const naoEhPdf = new File(['data'], 'contrato.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    fireEvent.change(input, { target: { files: [naoEhPdf] } })
    await waitFor(() => {
      expect(screen.getByTestId('erro-pdf-assinado')).toBeInTheDocument()
      expect(screen.getByText(/apenas arquivos pdf/i)).toBeInTheDocument()
    })
    expect(enviarAssinadoMock).not.toHaveBeenCalled()
  })

  it('upload de PDF válido chama enviarDocumentoAssinado e toast sucesso', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    const input = screen.getByTestId('input-pdf-assinado')
    const pdfFile = new File(['pdf'], 'assinado.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [pdfFile] } })
    fireEvent.click(screen.getByTestId('btn-enviar-assinado'))
    await waitFor(() => expect(enviarAssinadoMock).toHaveBeenCalledWith(expect.objectContaining({
      projetoId: 'proj-1',
      documentoId: 'doc-1',
    })))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalled())
  })
})

describe('T5.2 — Representante — ver documento', () => {
  it('exibe link para baixar o PDF da proposta', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={DADOS_PENDENTE}
      />
    )
    expect(screen.getByTestId('ver-documento')).toBeInTheDocument()
    // aria-label do anchor é "Baixar documento da proposta (PDF) — abre em nova aba"
    const link = screen.getByRole('link', { name: /baixar documento da proposta/i })
    expect(link).toHaveAttribute('href', 'https://storage.example.com/proposta.pdf')
  })
})

describe('T5.2 — Representante — estado não-ativo (recusada/expirada)', () => {
  it('mostra msg de inativa quando recusada', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="representante"
        dados={{ estadoProjeto: 'proposta_em_analise', statusAssinatura: 'recusada' }}
      />
    )
    expect(screen.getByTestId('msg-inativa')).toBeInTheDocument()
    expect(screen.queryByTestId('caminhos-assinatura')).not.toBeInTheDocument()
    expect(screen.queryByTestId('btn-contrapropor')).not.toBeInTheDocument()
  })
})
