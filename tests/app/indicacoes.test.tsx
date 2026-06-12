/**
 * T-O3.4 — S2 /app/indicacoes (auto-indicação + lista por papel)
 * TDD RED: CTA "Indicar-me" → "JÁ INDICADO · Retirar" (aria-live);
 * não-verificado = .ubm-locked "Verifique sua conta";
 * janela fechada desabilita (RN9); sigilo = .ubm-locked (CA25);
 * coordenador vê só seu curso; admin vê todas com atalho "Compor equipe".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/indicacoes',
}))

import { IndicacoesCta } from '@/app/app/indicacoes/indicacoes-client'

const mockIndicar = vi.fn()
const mockRetirar = vi.fn()

beforeEach(() => {
  mockIndicar.mockReset().mockResolvedValue({ ok: true })
  mockRetirar.mockReset().mockResolvedValue({ ok: true })
})

describe('IndicacoesCta — T-O3.4', () => {
  it('exibe CTA "Indicar-me" quando disponível e não indicado', () => {
    render(
      <IndicacoesCta
        projetoId="proj-1"
        papelBase="aluno"
        status={{ jaIndicado: false, verificado: true, janelaAberta: true }}
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />,
    )
    expect(screen.getByRole('button', { name: /indicar-me/i })).toBeInTheDocument()
  })

  it('após indicar, exibe "JÁ INDICADO · Retirar" com aria-live', async () => {
    render(
      <IndicacoesCta
        projetoId="proj-1"
        papelBase="aluno"
        status={{ jaIndicado: false, verificado: true, janelaAberta: true }}
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /indicar-me/i }))
    await waitFor(() => {
      expect(screen.getByText(/JÁ INDICADO/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retirar/i })).toBeInTheDocument()
    })
    // aria-live deve estar presente
    expect(document.querySelector('[aria-live]')).toBeInTheDocument()
  })

  it('estado já indicado inicial exibe "JÁ INDICADO" e botão Retirar', () => {
    render(
      <IndicacoesCta
        projetoId="proj-1"
        papelBase="aluno"
        status={{ jaIndicado: true, verificado: true, janelaAberta: true }}
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />,
    )
    expect(screen.getByText(/JÁ INDICADO/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retirar/i })).toBeInTheDocument()
  })

  it('retirar indicação volta ao CTA "Indicar-me"', async () => {
    render(
      <IndicacoesCta
        projetoId="proj-1"
        papelBase="aluno"
        status={{ jaIndicado: true, verificado: true, janelaAberta: true }}
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /retirar/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /indicar-me/i })).toBeInTheDocument()
    })
  })

  it('não-verificado exibe .ubm-locked com "Verifique sua conta" (RN8)', () => {
    render(
      <IndicacoesCta
        projetoId="proj-1"
        papelBase="aluno"
        status={{ jaIndicado: false, verificado: false, janelaAberta: true }}
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />,
    )
    expect(screen.getAllByText(/verifique sua conta/i).length).toBeGreaterThanOrEqual(1)
    // Não deve ter CTA de indicar
    expect(screen.queryByRole('button', { name: /indicar-me/i })).toBeNull()
  })

  it('janela fechada desabilita o CTA com mensagem explicativa (RN9)', () => {
    render(
      <IndicacoesCta
        projetoId="proj-1"
        papelBase="aluno"
        status={{ jaIndicado: false, verificado: true, janelaAberta: false }}
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />,
    )
    expect(screen.getByText(/indicações encerradas/i)).toBeInTheDocument()
    expect(screen.getByText(/equipe deste projeto já foi formada/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /indicar-me/i })).toBeNull()
  })

  it('onIndicar chamado com projetoId e papel corretos', async () => {
    render(
      <IndicacoesCta
        projetoId="proj-abc"
        papelBase="coordenador"
        status={{ jaIndicado: false, verificado: true, janelaAberta: true }}
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /indicar-me/i }))
    await waitFor(() => expect(mockIndicar).toHaveBeenCalledWith('proj-abc', 'coordenador'))
  })

  it('exibe erro da action em caso de falha', async () => {
    mockIndicar.mockResolvedValueOnce({ ok: false, error: 'Você já possui uma indicação ativa para este projeto.' })
    render(
      <IndicacoesCta
        projetoId="proj-1"
        papelBase="aluno"
        status={{ jaIndicado: false, verificado: true, janelaAberta: true }}
        onIndicar={mockIndicar}
        onRetirar={mockRetirar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /indicar-me/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/indicação/i)
  })
})
