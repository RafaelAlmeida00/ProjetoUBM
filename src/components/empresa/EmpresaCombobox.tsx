'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Plus, Check } from 'lucide-react'
import { buscarEmpresa, obterOuCriarEmpresa, type EmpresaResult } from '@/lib/actions/empresa'

/**
 * Sentinel usado no fluxo anônimo/landing (RN26/CA26 / architecture D.6).
 * id='__criar__' + criar=true indica que a empresa será criada no submit pós-login.
 * Nunca deve chegar ao banco como texto livre (RN6).
 */
const SENTINEL_ID = '__criar__'

export function criarSentinel(nome: string): EmpresaResult {
  return { id: SENTINEL_ID, nome, criar: true }
}

export function isSentinel(v: EmpresaResult | null): boolean {
  return v?.id === SENTINEL_ID && v?.criar === true
}

interface EmpresaComboboxProps {
  value: EmpresaResult | null
  onChange: (empresa: EmpresaResult) => void
  label?: string
  placeholder?: string
  /**
   * mode="anon"  — fluxo anônimo da landing: "Criar empresa" emite sentinel sem chamar RPC
   *                (RPC exige sessão; empresa criada no submit pós-login).
   * mode="auth"  — (padrão) usuário autenticado: chama obterOuCriarEmpresa imediatamente.
   */
  mode?: 'anon' | 'auth'
}

const DEBOUNCE_MS = 250

/**
 * T5 — EmpresaCombobox reutilizável (usado em /propor e telas admin).
 * WAI-ARIA combobox: role="combobox" + role="listbox" + aria-expanded + aria-controls.
 * Nunca aceita texto livre como empresa_id (RN6).
 *
 * CA26 / RN26: "Criar empresa <nome>" emite seleção canônica válida.
 * No modo anon (landing), emite sentinel e habilita o avanço sem chamar RPC.
 * No modo auth (autenticado), chama obterOuCriarEmpresa imediatamente.
 */
export function EmpresaCombobox({
  value,
  onChange,
  label = 'Empresa',
  placeholder = 'Busque o nome da sua empresa…',
  mode = 'auth',
}: EmpresaComboboxProps) {
  const id = useId()
  const listboxId = `${id}-listbox`
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState(value?.nome ?? '')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<EmpresaResult[]>([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const [creating, setCreating] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // sincroniza display quando valor externo muda
  useEffect(() => {
    setQuery(value?.nome ?? '')
  }, [value])

  const buscar = (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!q || q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      const res = await buscarEmpresa(q)
      setResults(res)
      setOpen(true)
      setActiveIdx(-1)
      setLoading(false)
    }, DEBOUNCE_MS)
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    buscar(e.target.value)
  }

  const selecionar = (empresa: EmpresaResult) => {
    onChange(empresa)
    setQuery(empresa.nome)
    setOpen(false)
    setResults([])
    inputRef.current?.focus()
  }

  /**
   * Ação de "Criar empresa":
   * - mode="anon": emite sentinel imediatamente (sem RPC — sessão não existe ainda).
   * - mode="auth": chama obterOuCriarEmpresa (criação real no banco).
   */
  const criar = async () => {
    if (!query.trim()) return
    const nome = query.trim()
    setOpen(false)

    if (mode === 'anon') {
      // CA26 / RN26 / architecture D.6: seleção canônica via sentinel
      const sentinel = criarSentinel(nome)
      onChange(sentinel)
      setQuery(nome)
      inputRef.current?.focus()
      return
    }

    // mode="auth" — criação real
    setCreating(true)
    const result = await obterOuCriarEmpresa(nome)
    setCreating(false)
    if (result.ok) {
      onChange(result.empresa)
      setQuery(result.empresa.nome)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const total = results.length + 1 // +1 para opção "criar"
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, total - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && activeIdx < results.length) {
        selecionar(results[activeIdx])
      } else if (activeIdx === results.length) {
        void criar()
      }
    } else if (e.key === 'Home') {
      setActiveIdx(0)
    } else if (e.key === 'End') {
      setActiveIdx(total - 1)
    }
  }

  const activeDescendant =
    open && activeIdx >= 0 ? `${id}-option-${activeIdx}` : undefined

  return (
    <div className="ubm-combobox">
      {label && (
        <label htmlFor={`${id}-input`} style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}>
          {label}
        </label>
      )}
      <div className="ubm-combobox-input-wrap">
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          autoComplete="off"
          className="ubm-combobox-input"
          placeholder={placeholder}
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          disabled={creating}
        />
        {(loading || creating) && (
          <Loader2
            className="ubm-combobox-busy"
            aria-hidden
            size={18}
          />
        )}
        {value && !loading && !creating && (
          <Check
            className="ubm-combobox-busy"
            aria-hidden
            size={16}
            style={{ color: 'hsl(var(--success))' }}
          />
        )}
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="ubm-combobox-popover"
          aria-label="Empresas encontradas"
        >
          {results.length === 0 && !loading && (
            <p className="ubm-combobox-empty">
              Nenhuma empresa encontrada para &ldquo;{query}&rdquo;.
            </p>
          )}

          {results.map((empresa, idx) => (
            <div
              key={empresa.id}
              id={`${id}-option-${idx}`}
              role="option"
              aria-selected={value?.id === empresa.id}
              className={`ubm-combobox-option${activeIdx === idx ? ' is-active' : ''}`}
              onClick={() => selecionar(empresa)}
              onMouseEnter={() => setActiveIdx(idx)}
            >
              <span className="ubm-combobox-option-name">{empresa.nome}</span>
              {empresa.n_dores != null && (
                <span className="ubm-combobox-option-meta">{empresa.n_dores} dor{empresa.n_dores !== 1 ? 'es' : ''}</span>
              )}
            </div>
          ))}

          {/* Opção "+ Criar empresa 'X'" — sempre visível se há query */}
          {query.trim().length >= 2 && (
            <button
              id={`${id}-option-${results.length}`}
              type="button"
              className={`ubm-combobox-create${activeIdx === results.length ? ' is-active' : ''}`}
              onClick={() => void criar()}
              onMouseEnter={() => setActiveIdx(results.length)}
            >
              <Plus size={16} aria-hidden />
              Criar empresa &ldquo;{query}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
