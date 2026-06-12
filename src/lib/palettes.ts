// Registro de paletas (abstração). Adicionar uma paleta = um item aqui + bloco [data-palette] no globals.css.
// A implementação real de troca virá numa tela de admin; por ora há um toggler de demonstração.
export type PaletteId = 'ubm' | 'vermelho'

export interface PaletteMeta {
  id: PaletteId
  label: string
}

export const PALETTES: PaletteMeta[] = [
  { id: 'ubm', label: 'Azul UBM' },
  { id: 'vermelho', label: 'Vermelho' },
]

export const DEFAULT_PALETTE: PaletteId = 'ubm'
