import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '@/components/modal/Modal'
import { CommunicatingLoader } from '@/components/modal/CommunicatingLoader'

// T2b — AC9 (modal/portal + loader comunicante), WCAG
describe('Modal', () => {
  it('renderiza como dialog acessível com o conteúdo', () => {
    render(
      <Modal open onClose={() => {}} title="Aviso">
        <p>Conteúdo do modal</p>
      </Modal>,
    )
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Conteúdo do modal')).toBeInTheDocument()
  })

  it('fecha com a tecla ESC', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="X">
        <p>c</p>
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('não renderiza quando fechado', () => {
    render(
      <Modal open={false} onClose={() => {}} title="X">
        <p>c</p>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('CommunicatingLoader', () => {
  it('mostra mensagem de progresso com aria-live (status)', () => {
    render(<CommunicatingLoader message="Preparando seu espaço..." />)
    expect(screen.getByText(/preparando seu espaço/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
