'use client'
/**
 * ToastProvider + useToast()
 * Sistema de feedback padrao UBM — design-feedback.md §1.2 / §1.3
 *
 * API publica:
 *   toast.sucesso(msg, opts?)  — role="status"  aria-live="polite"   duracao 4000ms
 *   toast.erro(msg, opts?)     — role="alert"   aria-live="assertive" duracao 6000ms
 *   toast.info(msg, opts?)     — role="status"  aria-live="polite"   duracao 4000ms
 *   toast.dispensar(id?)       — remove 1 ou todos
 *
 * Comportamento:
 *   - Stack FIFO, max 3 visíveis (4º remove o mais antigo)
 *   - Auto-dismiss com setTimeout (pausa no hover/focus do item)
 *   - Dismiss manual pelo botão × (aria-label="Fechar aviso")
 *   - ESC dispensa o toast mais recente (quando não há dialog ativo)
 *   - Foco NÃO roubado (sem focus-trap, sem autofocus)
 *   - Viewport injetada via createPortal no document.body
 *   - CSS: classes ubm-toast-* definidas em globals.css @layer components
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type ToastVariante = 'sucesso' | 'erro' | 'info'

export interface ToastOptions {
  /** ms até auto-dismiss. Default: 4000 (sucesso/info), 6000 (erro). 0 = não some. */
  duracao?: number
  /** Ação opcional (ex.: "Desfazer") */
  acao?: { rotulo: string; onClick: () => void }
}

export interface ToastApi {
  sucesso: (mensagem: string, opts?: ToastOptions) => string
  erro: (mensagem: string, opts?: ToastOptions) => string
  info: (mensagem: string, opts?: ToastOptions) => string
  dispensar: (id?: string) => void
}

// ─── Tipo interno ─────────────────────────────────────────────────────────────

interface ToastItem {
  id: string
  variante: ToastVariante
  mensagem: string
  duracao: number
  acao?: { rotulo: string; onClick: () => void }
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastApi | null>(null)

let _counter = 0
function newId(): string {
  // Usa crypto.randomUUID se disponível; fallback para contador
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `toast-${++_counter}`
}

const MAX_TOASTS = 3
const DEFAULT_DURACAO: Record<ToastVariante, number> = {
  sucesso: 4000,
  info: 4000,
  erro: 6000,
}

// ─── ToastItem UI ─────────────────────────────────────────────────────────────

function ToastItemUI({
  item,
  onDismiss,
}: {
  item: ToastItem
  onDismiss: (id: string) => void
}) {
  const [saindo, setSaindo] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remainingRef = useRef(item.duracao)
  const startRef = useRef<number>(0)

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    // Marca saindo para CSS animation; remove do estado no mesmo tick (sem delay)
    // para que testes com fake timers funcionem sem avançar 220ms extras
    setSaindo(true)
    onDismiss(item.id)
  }, [item.id, onDismiss])

  // Inicia timer de auto-dismiss
  const startTimer = useCallback(() => {
    if (remainingRef.current === 0) return
    startRef.current = Date.now()
    timerRef.current = setTimeout(dismiss, remainingRef.current)
  }, [dismiss])

  // Pausa timer (hover/focus)
  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    remainingRef.current = Math.max(
      0,
      remainingRef.current - (Date.now() - startRef.current),
    )
  }, [])

  useEffect(() => {
    startTimer()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [startTimer])

  const role = item.variante === 'erro' ? 'alert' : 'status'
  const ariaLive = item.variante === 'erro' ? 'assertive' : 'polite'

  const Icone =
    item.variante === 'sucesso'
      ? CheckCircle2
      : item.variante === 'erro'
        ? AlertCircle
        : Info

  return (
    <li
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      data-saindo={saindo ? 'true' : undefined}
      className={`ubm-toast-item ubm-toast-item--${item.variante}`}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      onFocusCapture={pauseTimer}
      onBlurCapture={startTimer}
    >
      <Icone
        className="ubm-toast-icone"
        aria-hidden="true"
        size={18}
      />
      <div className="ubm-toast-corpo">
        <span className="ubm-toast-msg">{item.mensagem}</span>
        {item.acao && (
          <div>
            <button
              type="button"
              className="ubm-toast-acao"
              onClick={() => {
                item.acao!.onClick()
                dismiss()
              }}
            >
              {item.acao.rotulo}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="ubm-toast-fechar"
        aria-label="Fechar aviso"
        onClick={dismiss}
      >
        <X size={14} aria-hidden />
      </button>
    </li>
  )
}

// ─── ToastViewport (via portal) ───────────────────────────────────────────────

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  // ESC: dispensa o toast mais recente quando não há dialog ativo
  useEffect(() => {
    if (toasts.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Não age se há um dialog ativo que já tratou o evento
      if (
        document.activeElement?.closest('[role="dialog"]') ||
        document.querySelector('[role="dialog"]')
      ) {
        return
      }
      // Remove o último (mais recente)
      const ultimo = toasts[toasts.length - 1]
      if (ultimo) onDismiss(ultimo.id)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toasts, onDismiss])

  if (typeof document === 'undefined') return null

  const viewport = (
    <ul
      className="ubm-toast-viewport"
      aria-label="Avisos"
      aria-relevant="additions removals"
    >
      {toasts.map((item) => (
        <ToastItemUI key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </ul>
  )

  return createPortal(viewport, document.body)
}

// ─── ToastProvider ────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const add = useCallback(
    (variante: ToastVariante, mensagem: string, opts?: ToastOptions): string => {
      const id = newId()
      const duracao = opts?.duracao !== undefined ? opts.duracao : DEFAULT_DURACAO[variante]
      const item: ToastItem = { id, variante, mensagem, duracao, acao: opts?.acao }

      setToasts((prev) => {
        // Limita a MAX_TOASTS: se já temos 3, remove o mais antigo (índice 0)
        const base = prev.length >= MAX_TOASTS ? prev.slice(1) : prev
        return [...base, item]
      })

      return id
    },
    [],
  )

  const dispensar = useCallback((id?: string) => {
    if (id === undefined) {
      setToasts([])
    } else {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }
  }, [])

  const api: ToastApi = {
    sucesso: (msg, opts) => add('sucesso', msg, opts),
    erro: (msg, opts) => add('erro', msg, opts),
    info: (msg, opts) => add('info', msg, opts),
    dispensar,
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dispensar} />
    </ToastContext.Provider>
  )
}

// ─── Hook público ─────────────────────────────────────────────────────────────

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast() deve ser usado dentro de <ToastProvider>')
  return ctx
}
