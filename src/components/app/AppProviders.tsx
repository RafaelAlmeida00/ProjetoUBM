'use client'
import type { ReactNode } from 'react'
import { ThemeProvider } from '../theme/ThemeProvider'
import { ModalProvider } from '../modal/ModalProvider'

// Providers globais montados no layout (tema + modais/portais).
// T16: PaletteProvider (localStorage/client-side) foi aposentado.
// A paleta é resolvida no servidor (PaletteStyle no RootLayout) —
// zero decisão de cor no cliente, zero FOUC, zero "cada navegador uma cor".
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ModalProvider>{children}</ModalProvider>
    </ThemeProvider>
  )
}
