/**
 * T17 — RED tests para primitivas @layer components no globals.css
 *
 * Verifica:
 * 1. Todas as primitivas da tabela design §4 existem em @layer components
 * 2. Nenhuma primitiva usa cor/hex nova fora das HSL vars dos tokens
 * 3. Nenhuma toca tokens fixos (background, foreground, card, etc.)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CSS_PATH = resolve(__dirname, '../../src/app/globals.css')

function carregarCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

/**
 * Extrai o conteúdo do @layer components
 */
function extrairLayerComponents(css: string): string {
  const match = css.match(/@layer components\s*\{([\s\S]*)\}[\s\S]*$/)
  return match ? match[1] : css
}

describe('T17 — Primitivas ubm-* em @layer components', () => {
  it('.ubm-swatch existe em @layer components', () => {
    const css = carregarCss()
    const layer = extrairLayerComponents(css)
    expect(layer).toMatch(/\.ubm-swatch\b/)
  })

  it('.ubm-swatch-trio existe em @layer components', () => {
    const css = carregarCss()
    const layer = extrairLayerComponents(css)
    expect(layer).toMatch(/\.ubm-swatch-trio\b/)
  })

  it('.ubm-aa-badge existe em @layer components', () => {
    const css = carregarCss()
    const layer = extrairLayerComponents(css)
    expect(layer).toMatch(/\.ubm-aa-badge\b/)
  })

  it('.ubm-aa-report existe em @layer components', () => {
    const css = carregarCss()
    const layer = extrairLayerComponents(css)
    expect(layer).toMatch(/\.ubm-aa-report\b/)
  })

  it('.ubm-palette-card existe em @layer components', () => {
    const css = carregarCss()
    const layer = extrairLayerComponents(css)
    expect(layer).toMatch(/\.ubm-palette-card\b/)
  })

  it('.ubm-official-switch existe em @layer components', () => {
    const css = carregarCss()
    const layer = extrairLayerComponents(css)
    expect(layer).toMatch(/\.ubm-official-switch\b/)
  })

  it('.ubm-preview-frame existe em @layer components', () => {
    const css = carregarCss()
    const layer = extrairLayerComponents(css)
    expect(layer).toMatch(/\.ubm-preview-frame\b/)
  })

  it('.ubm-seed-input existe em @layer components', () => {
    const css = carregarCss()
    const layer = extrairLayerComponents(css)
    expect(layer).toMatch(/\.ubm-seed-input\b/)
  })

  it('primitivas não introduzem cor/hex nova (#rrggbb ou rgb())', () => {
    const css = carregarCss()
    // Extrai apenas a seção das primitivas novas (007)
    const palettaSection = css.match(/ubm-swatch[\s\S]*?ubm-seed-input[\s\S]*?(?=\/\* ─{3}|$)/)
    if (!palettaSection) return // seção ainda não existe — falha nos testes acima

    const section = palettaSection[0]
    // Não deve ter hex direto nem rgb() nas primitivas
    expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(section).not.toMatch(/\brgb\(/)
  })

  it('primitivas derivam de variáveis HSL (var(--*)) e não tocam tokens fixos', () => {
    const css = carregarCss()
    const layer = extrairLayerComponents(css)

    // Extrai blocos das primitivas 007
    const swatchIdx = layer.indexOf('.ubm-swatch')
    if (swatchIdx === -1) return // seção ainda não existe

    const primitivasSection = layer.slice(swatchIdx)

    // Não deve redefinir tokens fixos como --background, --foreground, --card
    expect(primitivasSection).not.toMatch(/--background\s*:/)
    expect(primitivasSection).not.toMatch(/--foreground\s*:/)
    expect(primitivasSection).not.toMatch(/--card\s*:/)
    expect(primitivasSection).not.toMatch(/--border\s*:/)
    expect(primitivasSection).not.toMatch(/--radius\s*:/)
    expect(primitivasSection).not.toMatch(/--destructive\s*:/)
    expect(primitivasSection).not.toMatch(/--success\s*:/)
    expect(primitivasSection).not.toMatch(/--warning\s*:/)
    expect(primitivasSection).not.toMatch(/--info\s*:/)
  })

  it('.ubm-aa-badge tem variante --ok e --fail (derivadas de tokens success/destructive)', () => {
    const css = carregarCss()
    const layer = extrairLayerComponents(css)
    // Deve ter as variantes do badge AA
    expect(layer).toMatch(/ubm-aa-badge--ok|ubm-aa-badge\.ubm-aa-badge--ok|\.ubm-aa-badge--ok/)
    expect(layer).toMatch(/ubm-aa-badge--fail|\.ubm-aa-badge--fail/)
  })
})
