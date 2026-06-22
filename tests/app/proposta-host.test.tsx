/**
 * T5.1 — SecaoProposta visão HOST
 * RED → GREEN: cada estado renderiza a zona certa;
 * CTA chama a action; cláusula obrigatória bloqueia envio sem aceite (RN6).
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
const toastInfo = vi.fn()
vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: toastSucesso, erro: toastErro, info: toastInfo, dispensar: vi.fn() }),
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

const BASE: DadosProposta = { estadoProjeto: 'aguardando_proposta' }

beforeEach(() => {
  toastSucesso.mockReset()
  toastErro.mockReset()
  toastInfo.mockReset()
  enviarPropostaMock.mockResolvedValue({ ok: true })
  iniciarExecucaoMock.mockResolvedValue({ ok: true })
  finalizarProjetoMock.mockResolvedValue({ ok: true })
  contrapropMock.mockResolvedValue({ ok: true })
  enviarAssinadoMock.mockResolvedValue({ ok: true })
})

describe('T5.1 — SecaoProposta HOST — estado aguardando_proposta', () => {
  it('renderiza zona de envio com dropzone e cláusula', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={BASE}
        representanteNome="Ana Rep"
        representanteEmail="ana@empresa.com"
      />
    )
    expect(screen.getByTestId('zona-enviar')).toBeInTheDocument()
    expect(screen.getByTestId('clausula-aceite')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enviar proposta para assinatura/i })).toBeInTheDocument()
  })

  it('bloqueia envio sem cláusula aceita (RN6) — mostra erro de consent', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={BASE}
        representanteNome="Ana Rep"
        representanteEmail="ana@empresa.com"
      />
    )
    const file = new File(['pdf'], 'proposta.pdf', { type: 'application/pdf' })
    const input = screen.getByLabelText(/selecionar arquivo pdf da proposta/i)
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /enviar proposta para assinatura/i }))
    await waitFor(() => {
      expect(screen.getByTestId('erro-consent')).toBeInTheDocument()
    })
    expect(enviarPropostaMock).not.toHaveBeenCalled()
  })

  it('bloqueia envio sem PDF — mostra erro de pdf', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={BASE}
        representanteNome="Ana Rep"
        representanteEmail="ana@empresa.com"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /enviar proposta para assinatura/i }))
    await waitFor(() => {
      expect(screen.getByTestId('erro-pdf')).toBeInTheDocument()
    })
    expect(enviarPropostaMock).not.toHaveBeenCalled()
  })

  it('chama enviarProposta e dispara toast sucesso com PDF + cláusula', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={BASE}
        representanteNome="Ana Rep"
        representanteEmail="ana@empresa.com"
      />
    )
    const file = new File(['pdf'], 'proposta.pdf', { type: 'application/pdf' })
    const input = screen.getByLabelText(/selecionar arquivo pdf da proposta/i)
    fireEvent.change(input, { target: { files: [file] } })
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: /enviar proposta para assinatura/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Proposta enviada para assinatura.'))
    expect(enviarPropostaMock).toHaveBeenCalledWith(expect.objectContaining({
      projetoId: 'proj-1',
      signatario: { nome: 'Ana Rep', email: 'ana@empresa.com' },
    }))
  })

  it('dispara toast erro quando enviarProposta falha', async () => {
    enviarPropostaMock.mockResolvedValue({ ok: false, error: 'Erro simulado.' })
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={BASE}
        representanteNome="Ana Rep"
        representanteEmail="ana@empresa.com"
      />
    )
    const file = new File(['pdf'], 'proposta.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/selecionar arquivo pdf da proposta/i), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /enviar proposta para assinatura/i }))
    await waitFor(() => expect(toastErro).toHaveBeenCalled())
  })

  it('exibe o MOTIVO da contraproposta quando o rep devolveu (host precisa saber o porquê)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{
          estadoProjeto: 'aguardando_proposta',
          contraproposta: { motivo: 'Ajustar o prazo de entrega para 60 dias', criadoEm: '2026-06-21T00:00:00Z' },
        }}
      />
    )
    expect(screen.getByTestId('contraproposta-motivo')).toBeInTheDocument()
    expect(screen.getByText(/ajustar o prazo de entrega para 60 dias/i)).toBeInTheDocument()
  })
})

describe('T5.1 — SecaoProposta HOST — estado proposta_em_analise (pendente)', () => {
  it('renderiza zona de acompanhamento (não mostra enviar)', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{ estadoProjeto: 'proposta_em_analise', statusAssinatura: 'enviada' }}
      />
    )
    expect(screen.getByTestId('zona-pendente')).toBeInTheDocument()
    expect(screen.queryByTestId('zona-enviar')).not.toBeInTheDocument()
    expect(screen.getByText(/aguardando o representante assinar/i)).toBeInTheDocument()
  })

  it('exibe opção de reenvio quando recusada', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{ estadoProjeto: 'proposta_em_analise', statusAssinatura: 'recusada' }}
      />
    )
    expect(screen.getByTestId('btn-reenviar')).toBeInTheDocument()
    expect(screen.getByText(/o representante recusou/i)).toBeInTheDocument()
  })

  it('exibe opção de reenvio quando expirada', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{ estadoProjeto: 'proposta_em_analise', statusAssinatura: 'expirada' }}
      />
    )
    expect(screen.getByTestId('btn-reenviar')).toBeInTheDocument()
  })
})

describe('T5.1 — SecaoProposta HOST — estado proposta_aprovada', () => {
  it('exibe stamp "PROPOSTA SELADA" e botão iniciar execução', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{ estadoProjeto: 'proposta_aprovada' }}
      />
    )
    expect(screen.getByTestId('zona-aprovada')).toBeInTheDocument()
    // usa aria-label exato do stamp (não do chip de cabeçalho "Estado: proposta selada")
    expect(screen.getByLabelText('Proposta selada')).toBeInTheDocument()
    expect(screen.getByTestId('btn-iniciar')).toBeInTheDocument()
  })

  it('chama iniciarExecucao e dispara toast sucesso', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{ estadoProjeto: 'proposta_aprovada' }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /iniciar execução do projeto/i }))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith('Execução iniciada.'))
    expect(iniciarExecucaoMock).toHaveBeenCalledWith('proj-1')
  })
})

describe('T5.1 — SecaoProposta HOST — estado em_execucao', () => {
  it('exibe botão finalizar', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{ estadoProjeto: 'em_execucao' }}
      />
    )
    expect(screen.getByTestId('zona-execucao')).toBeInTheDocument()
    expect(screen.getByTestId('btn-finalizar')).toBeInTheDocument()
  })

  it('abre modal de confirmação ao clicar finalizar e chama action', async () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{ estadoProjeto: 'em_execucao' }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /finalizar o projeto/i }))
    expect(await screen.findByRole('dialog', { name: /finalizar projeto/i })).toBeInTheDocument()
    // clica no botão de confirmação dentro do modal
    const btns = screen.getAllByRole('button', { name: /finalizar projeto/i })
    fireEvent.click(btns[btns.length - 1])
    await waitFor(() => expect(finalizarProjetoMock).toHaveBeenCalledWith('proj-1'))
    await waitFor(() => expect(toastSucesso).toHaveBeenCalled())
  })
})

describe('T5.1 — SecaoProposta HOST — estado finalizado', () => {
  it('exibe stamp FINALIZADO e microcopy de vitrine', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{ estadoProjeto: 'finalizado' }}
      />
    )
    expect(screen.getByTestId('zona-finalizado')).toBeInTheDocument()
    expect(screen.getByLabelText(/projeto finalizado/i)).toBeInTheDocument()
    expect(screen.getByText(/vitrine/i)).toBeInTheDocument()
  })
})

describe('T5.1 — SecaoProposta HOST — alerta de loop (≥3 rodadas)', () => {
  it('exibe alerta suave quando nRodadas >= 3', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{ estadoProjeto: 'aguardando_proposta', nRodadas: 3 }}
      />
    )
    expect(screen.getByTestId('alerta-loop')).toBeInTheDocument()
    expect(screen.getByText(/trocaram algumas versões/i)).toBeInTheDocument()
  })

  it('NÃO exibe alerta com 2 rodadas', () => {
    render(
      <SecaoProposta
        projetoId="proj-1"
        papel="host"
        dados={{ estadoProjeto: 'aguardando_proposta', nRodadas: 2 }}
      />
    )
    expect(screen.queryByTestId('alerta-loop')).not.toBeInTheDocument()
  })
})
