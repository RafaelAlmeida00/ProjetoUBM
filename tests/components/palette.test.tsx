import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaletteProvider } from '@/components/theme/PaletteProvider'
import { PaletteToggle } from '@/components/theme/PaletteToggle'
import { PALETTES } from '@/lib/palettes'

// Abstração de paleta (azul UBM ↔ vermelho ...) — mecanismo p/ admin futuro.
describe('PaletteProvider + PaletteToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-palette')
  })

  it('aplica a paleta padrão (ubm) e alterna para a próxima, persistindo', () => {
    render(
      <PaletteProvider>
        <PaletteToggle />
      </PaletteProvider>,
    )
    expect(document.documentElement.getAttribute('data-palette')).toBe('ubm')
    fireEvent.click(screen.getByRole('button', { name: /paleta/i }))
    expect(document.documentElement.getAttribute('data-palette')).toBe(PALETTES[1].id)
    expect(localStorage.getItem('ubm.palette')).toBe(PALETTES[1].id)
  })
})
