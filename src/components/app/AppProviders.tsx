'use client'
import type { ReactNode } from 'react'
import { ThemeProvider } from '../theme/ThemeProvider'
import { ModalProvider } from '../modal/ModalProvider'
import { ToastProvider } from '../feedback/ToastProvider'

// Providers globais montados no layout (tema + modais/portais + toasts).
// T16: PaletteProvider (localStorage/client-side) foi aposentado.
// A paleta é resolvida no servidor (PaletteStyle no RootLayout) —
// zero decisão de cor no cliente, zero FOUC, zero "cada navegador uma cor".
//
// Ordem: ThemeProvider > ModalProvider > ToastProvider
// ToastProvider fica abaixo de ModalProvider: viewport de toast usa z-index 90
// (> overlay de modal 60), logo toasts disparados dentro de modais renderizam
// acima via createPortal no body — independe da árvore de empilhamento local.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ModalProvider>
        <ToastProvider>{children}</ToastProvider>
      </ModalProvider>
    </ThemeProvider>
  )
}
