'use client'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Modal } from './Modal'

interface ModalState {
  title: string
  content: ReactNode
}
interface ModalContextValue {
  show: (title: string, content: ReactNode) => void
  hide: () => void
}

const ModalContext = createContext<ModalContextValue | null>(null)

export function ModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModalState | null>(null)
  const show = useCallback((title: string, content: ReactNode) => setState({ title, content }), [])
  const hide = useCallback(() => setState(null), [])

  return (
    <ModalContext.Provider value={{ show, hide }}>
      {children}
      <Modal open={state !== null} onClose={hide} title={state?.title ?? ''}>
        {state?.content}
      </Modal>
    </ModalContext.Provider>
  )
}

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext)
  if (!ctx) throw new Error('useModal deve ser usado dentro de <ModalProvider>')
  return ctx
}
