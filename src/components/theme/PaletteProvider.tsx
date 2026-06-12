'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { PALETTES, DEFAULT_PALETTE, type PaletteId } from '@/lib/palettes'

interface PaletteContextValue {
  palette: PaletteId
  setPalette: (p: PaletteId) => void
  cycle: () => void
}

const PaletteContext = createContext<PaletteContextValue | null>(null)
const STORAGE_KEY = 'ubm.palette'

function isPalette(v: unknown): v is PaletteId {
  return PALETTES.some((p) => p.id === v)
}

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<PaletteId>(DEFAULT_PALETTE)

  useEffect(() => {
    try {
      const saved = globalThis.localStorage?.getItem(STORAGE_KEY)
      if (isPalette(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPaletteState(saved)
      }
    } catch {
      /* sem storage */
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', palette)
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, palette)
    } catch {
      /* noop */
    }
  }, [palette])

  const cycle = () => {
    const idx = PALETTES.findIndex((p) => p.id === palette)
    setPaletteState(PALETTES[(idx + 1) % PALETTES.length].id)
  }

  return (
    <PaletteContext.Provider value={{ palette, setPalette: setPaletteState, cycle }}>
      {children}
    </PaletteContext.Provider>
  )
}

export function usePalette(): PaletteContextValue {
  const ctx = useContext(PaletteContext)
  if (!ctx) throw new Error('usePalette deve ser usado dentro de <PaletteProvider>')
  return ctx
}
