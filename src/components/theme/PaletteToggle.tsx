'use client'
import { usePalette } from './PaletteProvider'
import { PALETTES } from '@/lib/palettes'

// Toggler de demonstração da abstração de paletas (a troca real virá numa tela de admin).
export function PaletteToggle() {
  const { palette, cycle } = usePalette()
  const meta = PALETTES.find((p) => p.id === palette)
  return (
    <button
      type="button"
      onClick={cycle}
      className="ubm-palette-toggle"
      aria-label={`Trocar paleta de cores (atual: ${meta?.label ?? palette})`}
      title="Trocar paleta (demo)"
    >
      <span className="ubm-palette-dot" aria-hidden="true" />
      <span className="ubm-palette-label">{meta?.label ?? palette}</span>
    </button>
  )
}
