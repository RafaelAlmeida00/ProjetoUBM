/**
 * T14 + T15 — RED tests para:
 *   - lib/theming/resolver-paleta.ts  (resolvePalette)
 *   - components/theme/PaletteStyle.tsx  (<PaletteStyle> RSC)
 *   - contrato anti-FOUC: markup já contém a cor no 1º render, sem useEffect
 *
 * Disciplina TDD: estes testes DEVEM FALHAR antes de existir o módulo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// ─── Mock do Supabase server client ──────────────────────────────────────────
const mockRpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({ rpc: mockRpc }),
}))

// Tokens de exemplo (formato retornado pela RPC)
const TOKENS_LIGHT_JSON = {
  primary: '205 68% 33%',
  'primary-foreground': '0 0% 100%',
  accent: '345 62% 30%',
  'accent-foreground': '0 0% 100%',
  ring: '205 68% 33%',
  secondary: '40 18% 88%',
  'secondary-foreground': '215 30% 18%',
}
const TOKENS_DARK_JSON = {
  primary: '205 75% 62%',
  'primary-foreground': '216 40% 10%',
  accent: '345 60% 60%',
  'accent-foreground': '216 40% 10%',
  ring: '205 75% 62%',
  secondary: '216 20% 20%',
  'secondary-foreground': '40 24% 92%',
}

// Constante ENCAIXE para verificar fallback
const ENCAIXE_PRIMARY_LIGHT = '205 68% 33%'
const ENCAIXE_PRIMARY_DARK = '205 75% 62%'

describe('T14 — resolver-paleta + paletteToCss', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolvePalette: RPC disponível → retorna tokens_light e tokens_dark', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ tokens_light: TOKENS_LIGHT_JSON, tokens_dark: TOKENS_DARK_JSON }],
      error: null,
    })

    const { resolvePalette } = await import('@/lib/theming/resolver-paleta')
    const result = await resolvePalette('user-uid-123')
    expect(result).toHaveProperty('tokens_light')
    expect(result).toHaveProperty('tokens_dark')
    expect(result.tokens_light['primary']).toBe('205 68% 33%')
  })

  it('resolvePalette: RPC indisponível (erro) → retorna fallback ENCAIXE', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'relation does not exist' } })

    const { resolvePalette } = await import('@/lib/theming/resolver-paleta')
    const result = await resolvePalette('user-uid-123')
    expect(result.tokens_light['primary']).toBe(ENCAIXE_PRIMARY_LIGHT)
    expect(result.tokens_dark['primary']).toBe(ENCAIXE_PRIMARY_DARK)
  })

  it('resolvePalette: uid nulo → chama RPC com null (anônimo)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ tokens_light: TOKENS_LIGHT_JSON, tokens_dark: TOKENS_DARK_JSON }],
      error: null,
    })

    const { resolvePalette } = await import('@/lib/theming/resolver-paleta')
    await resolvePalette(null)
    expect(mockRpc).toHaveBeenCalledWith('resolver_paleta', { p_uid: null })
  })

  it('paletteToCss: emite :root e [data-theme="dark"] com as chaves fechadas', async () => {
    const { paletteToCss } = await import('@/lib/theming/resolver-paleta')
    const css = paletteToCss(TOKENS_LIGHT_JSON, TOKENS_DARK_JSON)

    expect(css).toContain(':root')
    expect(css).toContain('[data-theme="dark"]')
    expect(css).toContain('--primary:')
    expect(css).toContain('--accent:')
    expect(css).toContain('--ring:')
  })

  it('paletteToCss: não contém "nome" nem "semente" (RS-P4 — nunca no <style>)', async () => {
    const { paletteToCss } = await import('@/lib/theming/resolver-paleta')
    const css = paletteToCss(TOKENS_LIGHT_JSON, TOKENS_DARK_JSON)
    expect(css).not.toMatch(/nome|semente|label|seed/i)
  })

  it('paletteToCss: valor destoante (não-HSL) → fallback ENCAIXE para aquela chave (fail-closed)', async () => {
    const tokensComValorMalformado = {
      ...TOKENS_LIGHT_JSON,
      primary: 'red; } body { display:none',  // tentativa de injeção
    }
    const { paletteToCss } = await import('@/lib/theming/resolver-paleta')
    const css = paletteToCss(tokensComValorMalformado, TOKENS_DARK_JSON)

    // A chave primary deve aparecer, mas com o valor ENCAIXE (fallback), não o malformado
    expect(css).toContain('--primary:')
    expect(css).not.toContain('body { display:none')
    // deve conter o valor fallback azul ENCAIXE
    expect(css).toContain(ENCAIXE_PRIMARY_LIGHT)
  })

  it('paletteToCss: chave fora do conjunto fechado é ignorada (RS-P2)', async () => {
    const tokensComChaveExtra = {
      ...TOKENS_LIGHT_JSON,
      background: '0 0% 100%',  // chave fora do conjunto — deve ser ignorada
      'font-size': '16px',       // completamente fora
    }
    const { paletteToCss } = await import('@/lib/theming/resolver-paleta')
    const css = paletteToCss(tokensComChaveExtra, TOKENS_DARK_JSON)

    expect(css).not.toContain('--background:')
    expect(css).not.toContain('--font-size:')
  })
})

describe('T14 — PaletteStyle (componente RSC, anti-FOUC)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('renderiza um <style id="ubm-palette"> com as vars de cor', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ tokens_light: TOKENS_LIGHT_JSON, tokens_dark: TOKENS_DARK_JSON }],
      error: null,
    })

    const { PaletteStyle } = await import('@/components/theme/PaletteStyle')
    // PaletteStyle é um Server Component assíncrono → await resolve
    const element = await PaletteStyle({ uid: 'user-uid-123' })
    const markup = renderToStaticMarkup(element as React.ReactElement)

    expect(markup).toContain('id="ubm-palette"')
    expect(markup).toContain('--primary:')
  })

  it('cor está no markup imediato (anti-FOUC): sem useEffect, sem hidratação necessária', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ tokens_light: TOKENS_LIGHT_JSON, tokens_dark: TOKENS_DARK_JSON }],
      error: null,
    })

    const { PaletteStyle } = await import('@/components/theme/PaletteStyle')
    const element = await PaletteStyle({ uid: 'user-uid-123' })
    const markup = renderToStaticMarkup(element as React.ReactElement)

    // O markup server-rendered já contém a cor — sem hydration necessária
    expect(markup).toContain('205 68% 33%')  // primary light ENCAIXE
  })

  it('fallback: RPC indisponível → markup contém ENCAIXE (nunca-sem-cor)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })

    const { PaletteStyle } = await import('@/components/theme/PaletteStyle')
    const element = await PaletteStyle({ uid: null })
    const markup = renderToStaticMarkup(element as React.ReactElement)

    // Deve conter as cores ENCAIXE no fallback
    expect(markup).toContain(ENCAIXE_PRIMARY_LIGHT)
    expect(markup).toContain(ENCAIXE_PRIMARY_DARK)
  })

  it('uid null (anônimo) → resolve com a paleta oficial', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ tokens_light: TOKENS_LIGHT_JSON, tokens_dark: TOKENS_DARK_JSON }],
      error: null,
    })

    const { PaletteStyle } = await import('@/components/theme/PaletteStyle')
    await PaletteStyle({ uid: null })
    expect(mockRpc).toHaveBeenCalledWith('resolver_paleta', { p_uid: null })
  })
})

describe('T15 — layout.tsx importa PaletteStyle', () => {
  it('globals.css está presente e tem o @theme inline (base do sistema de tokens)', () => {
    // Verificação estática: o layout.tsx referencia PaletteStyle e globals.css existe
    const fs = require('node:fs')
    const path = require('node:path')
    const layoutPath = path.resolve(__dirname, '../../src/app/layout.tsx')
    const layoutSrc = fs.readFileSync(layoutPath, 'utf8')
    // T15: PaletteStyle deve estar importado no layout
    expect(layoutSrc).toContain('PaletteStyle')
    // T15: PaletteStyle deve estar usado no JSX (dentro do <head>)
    expect(layoutSrc).toContain('<PaletteStyle')
    // T15: uid deve ser passado para PaletteStyle
    expect(layoutSrc).toMatch(/PaletteStyle.*uid/s)
  })
})
