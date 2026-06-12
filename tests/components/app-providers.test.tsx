import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppProviders } from '@/components/app/AppProviders'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

// T3a — providers montados (tema/modal)
describe('AppProviders', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('provê o contexto de tema (toggle funciona dentro)', () => {
    render(
      <AppProviders>
        <ThemeToggle />
      </AppProviders>,
    )
    fireEvent.click(screen.getByRole('button', { name: /tema/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
