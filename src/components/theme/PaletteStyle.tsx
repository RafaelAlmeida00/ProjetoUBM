/**
 * components/theme/PaletteStyle.tsx
 *
 * T14 — Componente RSC (Server Component) que injeta o <style id="ubm-palette">
 * no <head> do layout com as variáveis CSS da paleta resolvida.
 *
 * Anti-FOUC por construção: o estilo está no 1º byte de HTML.
 * Nenhum useEffect, nenhuma hidratação necessária para a cor.
 *
 * contracts/paleta.md §7 / architecture.md §3.1 / design.md §6
 */
import { resolvePalette, paletteToCss } from '@/lib/theming/resolver-paleta'

interface PaletteStyleProps {
  /** auth.uid() do usuário logado; null = anônimo → oficial ativa */
  uid: string | null
}

/**
 * Componente assíncrono (RSC) — resolve a paleta por request e
 * injeta <style id="ubm-palette"> com :root e [data-theme="dark"].
 *
 * Posicionado no <head> do RootLayout, APÓS o globals.css na cascata
 * → override sem !important. Zero decisão de cor no cliente.
 *
 * architecture.md §3.1 (passo 4)
 */
export async function PaletteStyle({ uid }: PaletteStyleProps) {
  const { tokens_light, tokens_dark } = await resolvePalette(uid)
  const css = paletteToCss(tokens_light, tokens_dark)

  return (
    <style
      id="ubm-palette"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: css }}
    />
  )
}
