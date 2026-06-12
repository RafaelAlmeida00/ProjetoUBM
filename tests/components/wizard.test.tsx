import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Wizard } from '@/components/wizard/Wizard'

// T2e — AC1 (1 input/tela + progresso), AC2 (microcopy), AC5 (sem campo de e-mail)
describe('Wizard', () => {
  beforeEach(() => localStorage.clear())

  it('mostra o primeiro passo com label, microcopy e um único input', () => {
    render(<Wizard onComplete={() => {}} />)
    expect(screen.getByText(/como podemos te chamar/i)).toBeInTheDocument()
    expect(screen.getByText(/seu nome/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('NÃO possui campo de e-mail (AC5/RN2)', () => {
    const { container } = render(<Wizard onComplete={() => {}} />)
    expect(container.querySelector('input[type="email"]')).toBeNull()
  })

  it('avança ao preencher o campo obrigatório do passo (AC1)', () => {
    render(<Wizard onComplete={() => {}} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Maria' } })
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    expect(screen.getByText(/de qual empresa/i)).toBeInTheDocument()
  })

  it('exibe indicador de progresso', () => {
    render(<Wizard onComplete={() => {}} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})
