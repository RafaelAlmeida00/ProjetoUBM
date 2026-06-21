/**
 * TDD RED — ToastProvider + useToast()
 * Comportamento: Context, API (sucesso/erro/info/dispensar), stack, auto-dismiss,
 * dismiss manual (botão ×), ESC, a11y (role/aria-live), max 3 toasts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// O componente a ser criado
import { ToastProvider, useToast } from '@/components/feedback/ToastProvider'

// Helper: componente de teste que usa o hook
function GatilhoToast({
  variante = 'sucesso',
  msg = 'Operação realizada.',
  duracao,
}: {
  variante?: 'sucesso' | 'erro' | 'info'
  msg?: string
  duracao?: number
}) {
  const toast = useToast()
  return (
    <button
      type="button"
      onClick={() => toast[variante](msg, duracao !== undefined ? { duracao } : undefined)}
    >
      Disparar {variante}
    </button>
  )
}

function GatilhoDismissar({ id }: { id?: string }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.dispensar(id)}>
      Dispensar
    </button>
  )
}

function renderComProvider(ui: React.ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('ToastProvider — API e comportamento', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('useToast() lança erro fora do Provider', () => {
    // Suprimir o erro de console do React
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<GatilhoToast />)).toThrow()
    spy.mockRestore()
  })

  it('dispara toast de sucesso e exibe a mensagem', () => {
    renderComProvider(<GatilhoToast variante="sucesso" msg="Perfil atualizado." />)
    fireEvent.click(screen.getByText(/disparar sucesso/i))
    expect(screen.getByText('Perfil atualizado.')).toBeInTheDocument()
  })

  it('toast de sucesso tem role="status" e aria-live="polite"', () => {
    renderComProvider(<GatilhoToast variante="sucesso" msg="Salvo." />)
    fireEvent.click(screen.getByText(/disparar sucesso/i))
    const item = screen.getByRole('status')
    expect(item).toBeInTheDocument()
    expect(item).toHaveAttribute('aria-live', 'polite')
  })

  it('dispara toast de erro e exibe a mensagem', () => {
    renderComProvider(<GatilhoToast variante="erro" msg="Erro ao salvar." />)
    fireEvent.click(screen.getByText(/disparar erro/i))
    expect(screen.getByText('Erro ao salvar.')).toBeInTheDocument()
  })

  it('toast de erro tem role="alert" e aria-live="assertive"', () => {
    renderComProvider(<GatilhoToast variante="erro" msg="Falha." />)
    fireEvent.click(screen.getByText(/disparar erro/i))
    const item = screen.getByRole('alert')
    expect(item).toBeInTheDocument()
    expect(item).toHaveAttribute('aria-live', 'assertive')
  })

  it('dispara toast de info com role="status"', () => {
    renderComProvider(<GatilhoToast variante="info" msg="Informação." />)
    fireEvent.click(screen.getByText(/disparar info/i))
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Informação.')).toBeInTheDocument()
  })

  it('auto-dismiss remove o toast após 4000ms (sucesso)', async () => {
    renderComProvider(<GatilhoToast variante="sucesso" msg="Some em 4s." />)
    fireEvent.click(screen.getByText(/disparar sucesso/i))
    expect(screen.getByText('Some em 4s.')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(4200) })
    expect(screen.queryByText('Some em 4s.')).not.toBeInTheDocument()
  })

  it('auto-dismiss remove o toast de erro após 6000ms', async () => {
    renderComProvider(<GatilhoToast variante="erro" msg="Erro some em 6s." />)
    fireEvent.click(screen.getByText(/disparar erro/i))
    // Não removido antes de 6000ms
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.queryByText('Erro some em 6s.')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1200) })
    expect(screen.queryByText('Erro some em 6s.')).not.toBeInTheDocument()
  })

  it('duracao: 0 não dispensa automaticamente', () => {
    renderComProvider(<GatilhoToast variante="sucesso" msg="Persiste." duracao={0} />)
    fireEvent.click(screen.getByText(/disparar sucesso/i))
    act(() => { vi.advanceTimersByTime(10000) })
    expect(screen.getByText('Persiste.')).toBeInTheDocument()
  })

  it('botão × fecha o toast individual', () => {
    renderComProvider(<GatilhoToast variante="sucesso" msg="Fechar pelo X." />)
    fireEvent.click(screen.getByText(/disparar sucesso/i))
    expect(screen.getByText('Fechar pelo X.')).toBeInTheDocument()
    const fechar = screen.getByRole('button', { name: /fechar aviso/i })
    fireEvent.click(fechar)
    expect(screen.queryByText('Fechar pelo X.')).not.toBeInTheDocument()
  })

  it('botão × tem aria-label="Fechar aviso"', () => {
    renderComProvider(<GatilhoToast variante="sucesso" msg="A11y fechar." />)
    fireEvent.click(screen.getByText(/disparar sucesso/i))
    expect(screen.getByRole('button', { name: /fechar aviso/i })).toBeInTheDocument()
  })

  it('ESC dispensa o toast mais recente', () => {
    renderComProvider(<GatilhoToast variante="sucesso" msg="ESC fecha." duracao={0} />)
    fireEvent.click(screen.getByText(/disparar sucesso/i))
    expect(screen.getByText('ESC fecha.')).toBeInTheDocument()
    // Dispara ESC globalmente (sem dialog ativo)
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.queryByText('ESC fecha.')).not.toBeInTheDocument()
  })

  it('máximo 3 toasts visíveis (4º remove o mais antigo)', () => {
    function Multi() {
      const toast = useToast()
      return (
        <>
          <button onClick={() => toast.sucesso('Toast 1', { duracao: 0 })}>Btn1</button>
          <button onClick={() => toast.sucesso('Toast 2', { duracao: 0 })}>Btn2</button>
          <button onClick={() => toast.sucesso('Toast 3', { duracao: 0 })}>Btn3</button>
          <button onClick={() => toast.sucesso('Toast 4', { duracao: 0 })}>Btn4</button>
        </>
      )
    }
    render(<ToastProvider><Multi /></ToastProvider>)
    fireEvent.click(screen.getByText('Btn1'))
    fireEvent.click(screen.getByText('Btn2'))
    fireEvent.click(screen.getByText('Btn3'))
    fireEvent.click(screen.getByText('Btn4'))
    // Toast 1 foi removido pelo overflow de max 3; 2, 3, 4 visíveis
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument()
    expect(screen.getByText('Toast 2')).toBeInTheDocument()
    expect(screen.getByText('Toast 3')).toBeInTheDocument()
    expect(screen.getByText('Toast 4')).toBeInTheDocument()
  })

  it('dispensar() sem id remove todos os toasts', () => {
    function DispensarTudo() {
      const toast = useToast()
      return (
        <>
          <button onClick={() => toast.sucesso('Msg Alpha', { duracao: 0 })}>BtnAlpha</button>
          <button onClick={() => toast.sucesso('Msg Beta', { duracao: 0 })}>BtnBeta</button>
          <button onClick={() => toast.dispensar()}>Dispensar tudo</button>
        </>
      )
    }
    render(<ToastProvider><DispensarTudo /></ToastProvider>)
    fireEvent.click(screen.getByText('BtnAlpha'))
    fireEvent.click(screen.getByText('BtnBeta'))
    expect(screen.getByText('Msg Alpha')).toBeInTheDocument()
    expect(screen.getByText('Msg Beta')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Dispensar tudo'))
    expect(screen.queryByText('Msg Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Msg Beta')).not.toBeInTheDocument()
  })

  it('toast com ação exibe o botão de ação com o rótulo dado', () => {
    function ComAcao() {
      const toast = useToast()
      return (
        <button onClick={() => toast.sucesso('Arquivado.', { duracao: 0, acao: { rotulo: 'Desfazer', onClick: () => {} } })}>
          Disparar com ação
        </button>
      )
    }
    render(<ToastProvider><ComAcao /></ToastProvider>)
    fireEvent.click(screen.getByText('Disparar com ação'))
    expect(screen.getByRole('button', { name: /desfazer/i })).toBeInTheDocument()
  })

  it('viewport tem aria-label="Avisos"', () => {
    renderComProvider(<GatilhoToast variante="sucesso" msg="Label OK." />)
    fireEvent.click(screen.getByText(/disparar sucesso/i))
    expect(screen.getByLabelText(/avisos/i)).toBeInTheDocument()
  })

  it('ícone do toast tem aria-hidden', () => {
    renderComProvider(<GatilhoToast variante="sucesso" msg="Ícone oculto." />)
    fireEvent.click(screen.getByText(/disparar sucesso/i))
    // O ícone SVG deve ter aria-hidden="true"
    const icons = document.querySelectorAll('.ubm-toast-icone')
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })
  })
})

describe('ToastProvider — classes CSS sem estilos fantasma', () => {
  it('item de sucesso tem classe ubm-toast-item--sucesso', () => {
    renderComProvider(<GatilhoToast variante="sucesso" msg="Verde." />)
    fireEvent.click(screen.getByText(/disparar sucesso/i))
    expect(document.querySelector('.ubm-toast-item--sucesso')).not.toBeNull()
  })

  it('item de erro tem classe ubm-toast-item--erro', () => {
    renderComProvider(<GatilhoToast variante="erro" msg="Vermelho." />)
    fireEvent.click(screen.getByText(/disparar erro/i))
    expect(document.querySelector('.ubm-toast-item--erro')).not.toBeNull()
  })

  it('item de info tem classe ubm-toast-item--info', () => {
    renderComProvider(<GatilhoToast variante="info" msg="Azul." />)
    fireEvent.click(screen.getByText(/disparar info/i))
    expect(document.querySelector('.ubm-toast-item--info')).not.toBeNull()
  })
})
