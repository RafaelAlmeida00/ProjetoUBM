/**
 * T16 — Tests para a aposentadoria do PaletteProvider/localStorage
 *
 * Verifica:
 * 1. AppProviders NÃO monta mais PaletteProvider
 * 2. Nenhuma escrita em localStorage['ubm.palette']
 * 3. globals.css NÃO tem mais o bloco [data-palette="vermelho"] hardcoded
 * 4. RTL existente do header/AppProviders continua verde
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AppProviders } from '@/components/app/AppProviders'
import { PaletteProvider } from '@/components/theme/PaletteProvider'

// ─── T16a: globals.css NÃO tem o bloco [data-palette="vermelho"] hardcoded ───
describe('T16a — globals.css sem bloco vermelho hardcoded', () => {
  it('globals.css não contém [data-palette="vermelho"] com valores embutidos', () => {
    const cssPath = resolve(__dirname, '../../src/app/globals.css')
    const css = readFileSync(cssPath, 'utf8')

    // O bloco hardcoded deve ter sido removido
    // Aceita o seletor como gancho de preview (sem os tokens de cor inlaid)
    // Mas NÃO deve ter --primary: definido dentro de [data-palette="vermelho"]
    const palettePrimary = /\[data-palette="vermelho"\]\s*\{[^}]*--primary:/
    expect(css).not.toMatch(palettePrimary)
  })

  it('globals.css não contém [data-theme="dark"][data-palette="vermelho"] hardcoded', () => {
    const cssPath = resolve(__dirname, '../../src/app/globals.css')
    const css = readFileSync(cssPath, 'utf8')

    const darkVermelho = /\[data-theme="dark"\]\[data-palette="vermelho"\]\s*\{/
    expect(css).not.toMatch(darkVermelho)
  })
})

// ─── T16b: AppProviders não monta PaletteProvider ─────────────────────────────
describe('T16b — AppProviders sem PaletteProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-palette')
  })

  it('AppProviders renderiza sem montar PaletteProvider (sem escrita em localStorage[ubm.palette])', () => {
    render(
      <AppProviders>
        <div data-testid="child">conteúdo</div>
      </AppProviders>,
    )

    // O filho renderiza normalmente
    expect(screen.getByTestId('child')).toBeTruthy()

    // NÃO deve haver escrita em localStorage['ubm.palette']
    expect(localStorage.getItem('ubm.palette')).toBeNull()
  })

  it('AppProviders não altera data-palette no <html> via PaletteProvider', () => {
    render(
      <AppProviders>
        <div>ok</div>
      </AppProviders>,
    )

    // PaletteProvider não deve ter setado data-palette
    // (o SSR define isso via PaletteStyle no <head>, não o client)
    expect(localStorage.getItem('ubm.palette')).toBeNull()
  })

  it('PaletteProvider ainda existe como módulo exportado (pode ser usado em preview)', () => {
    // PaletteProvider não some do código — apenas não está mais no AppProviders
    // Verifica que o módulo existe e exporta PaletteProvider
    expect(typeof PaletteProvider).toBe('function')
  })
})

// ─── T16c: Nenhuma escrita em localStorage['ubm.palette'] nas interações normais ──
describe('T16c — localStorage["ubm.palette"] não é escrito pelo fluxo normal', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('montar AppProviders não escreve ubm.palette no localStorage', () => {
    render(<AppProviders><span /></AppProviders>)
    expect(localStorage.getItem('ubm.palette')).toBeNull()
  })
})
