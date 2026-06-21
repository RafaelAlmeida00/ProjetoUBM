/**
 * Favicon por paleta ativa (azul/marsala) — o ícone da aba do navegador reflete a paleta
 * resolvida no servidor. Escolha pela MATIZ do --primary (azul ~205 vs marsala ~345),
 * por menor distância circular. Anti-FOUC: resolvido no <head>, sem decisão no cliente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mockRpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({ rpc: mockRpc }),
}))

describe('pickPaletteIconHref — escolha do ícone pela matiz do primary', () => {
  it('primary azul (hue ~205) → ícone azul', async () => {
    const { pickPaletteIconHref } = await import('@/lib/theming/resolver-paleta')
    expect(pickPaletteIconHref('205 68% 33%')).toBe('/ubm-icon-azul.png')
  })
  it('primary marsala (hue ~345) → ícone marsala', async () => {
    const { pickPaletteIconHref } = await import('@/lib/theming/resolver-paleta')
    expect(pickPaletteIconHref('345 62% 22%')).toBe('/ubm-icon-marsala.png')
  })
  it('custom vermelho (hue 18) → mais perto do marsala', async () => {
    const { pickPaletteIconHref } = await import('@/lib/theming/resolver-paleta')
    expect(pickPaletteIconHref('18 80% 40%')).toBe('/ubm-icon-marsala.png')
  })
  it('custom verde (hue 140) → mais perto do azul (marca padrão)', async () => {
    const { pickPaletteIconHref } = await import('@/lib/theming/resolver-paleta')
    expect(pickPaletteIconHref('140 50% 40%')).toBe('/ubm-icon-azul.png')
  })
  it('valor inválido → fallback azul (fail-safe, marca padrão)', async () => {
    const { pickPaletteIconHref } = await import('@/lib/theming/resolver-paleta')
    expect(pickPaletteIconHref('not-a-color')).toBe('/ubm-icon-azul.png')
  })
})

describe('PaletteFavicon (RSC) — <link rel="icon"> pela paleta resolvida', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules() })

  it('paleta azul → link aponta para o ícone azul', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ tokens_light: { primary: '205 68% 33%' }, tokens_dark: { primary: '205 75% 62%' } }],
      error: null,
    })
    const { PaletteFavicon } = await import('@/components/theme/PaletteFavicon')
    const el = await PaletteFavicon({ uid: 'u1' })
    const markup = renderToStaticMarkup(el as React.ReactElement)
    expect(markup).toContain('rel="icon"')
    expect(markup).toContain('/ubm-icon-azul.png')
  })

  it('paleta marsala → ícone marsala', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ tokens_light: { primary: '345 62% 22%' }, tokens_dark: { primary: '345 60% 60%' } }],
      error: null,
    })
    const { PaletteFavicon } = await import('@/components/theme/PaletteFavicon')
    const el = await PaletteFavicon({ uid: null })
    const markup = renderToStaticMarkup(el as React.ReactElement)
    expect(markup).toContain('/ubm-icon-marsala.png')
  })

  it('RPC indisponível → fallback ENCAIXE azul → ícone azul (nunca-sem-ícone)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    const { PaletteFavicon } = await import('@/components/theme/PaletteFavicon')
    const el = await PaletteFavicon({ uid: null })
    const markup = renderToStaticMarkup(el as React.ReactElement)
    expect(markup).toContain('/ubm-icon-azul.png')
  })
})
