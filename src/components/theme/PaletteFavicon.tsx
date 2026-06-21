/**
 * components/theme/PaletteFavicon.tsx
 *
 * RSC que injeta o <link rel="icon"> da aba do navegador com o ícone da MARCA
 * correspondente à paleta ativa (azul/marsala). Resolvido no servidor, no <head>
 * → ícone certo no 1º byte (mesma disciplina anti-FOUC do PaletteStyle).
 *
 * Escolha pela matiz do --primary resolvido (ver pickPaletteIconHref).
 */
import { resolvePalette, pickPaletteIconHref } from '@/lib/theming/resolver-paleta'

interface PaletteFaviconProps {
  /** auth.uid() do usuário logado; null = anônimo → oficial ativa */
  uid: string | null
}

export async function PaletteFavicon({ uid }: PaletteFaviconProps) {
  const { tokens_light } = await resolvePalette(uid)
  const href = pickPaletteIconHref(tokens_light.primary)
  return <link rel="icon" type="image/png" href={href} />
}
