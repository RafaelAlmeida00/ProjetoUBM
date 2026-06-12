'use client'
/**
 * T18 — OficialSelector (Zona A)
 *
 * Seletor da paleta oficial ativa site-wide.
 * role="radiogroup"; cada opção = role="radio".
 * Troca abre modal de confirmação (.ubm-confirm).
 * Confirma → definirOficialAtiva (action mockada nos testes).
 * ESC cancela. Enter confirma. CA1/CA2b/CA2c/CA6/CA13.
 */
import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, AlertTriangle, Radio } from 'lucide-react'
import { definirOficialAtiva } from '@/lib/actions/admin-paletas'

export interface PaletaOficial {
  id: string
  nome: string
  escopo: 'oficial' | 'empresa'
  ativa: boolean
  aprovadaAA: boolean
  tokensLight: Record<string, string>
  tokensDark: Record<string, string>
  criadoEm?: string
  adminEmail?: string
}

interface OficialSelectorProps {
  paletas: PaletaOficial[]
  onAtivada?: (id: string) => void
}

interface ModalConfirmProps {
  nome: string
  onConfirmar: () => void
  onCancelar: () => void
  carregando: boolean
}

function ModalConfirm({ nome, onConfirmar, onCancelar, carregando }: ModalConfirmProps) {
  // ESC fecha
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelar()
      if (e.key === 'Enter') onConfirmar()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onConfirmar, onCancelar])

  return (
    <div
      className="ubm-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Trocar a cor oficial do site"
    >
      <div className="ubm-modal ubm-machined">
        <div className="ubm-confirm">
          <p className="ubm-confirm-title">Trocar a cor oficial do site?</p>
          <p className="ubm-confirm-msg">
            Todos os visitantes e usuários sem empresa passarão a ver{' '}
            <strong>{nome}</strong>. Isto vale para o site inteiro e é reversível.
          </p>
          <div className="ubm-confirm-actions">
            <button
              type="button"
              className="ubm-btn ubm-btn-ghost"
              onClick={onCancelar}
              disabled={carregando}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="ubm-btn ubm-btn-primary"
              onClick={onConfirmar}
              disabled={carregando}
              aria-busy={carregando}
            >
              {carregando ? 'Ativando…' : 'Ativar no site'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function OficialSelector({ paletas, onAtivada }: OficialSelectorProps) {
  const [pendente, setPendente] = useState<PaletaOficial | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const mostrarToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const handleSelecionar = useCallback((paleta: PaletaOficial) => {
    if (paleta.ativa || !paleta.aprovadaAA) return
    setPendente(paleta)
  }, [])

  const handleConfirmar = useCallback(async () => {
    if (!pendente) return
    setCarregando(true)
    const result = await definirOficialAtiva(pendente.id)
    setCarregando(false)
    setPendente(null)
    if (result.ok) {
      mostrarToast(`Paleta oficial atualizada — todo o site agora usa ${pendente.nome}.`)
      onAtivada?.(pendente.id)
    }
  }, [pendente, onAtivada])

  const handleCancelar = useCallback(() => {
    setPendente(null)
  }, [])

  return (
    <>
      <div style={{ marginBottom: '0.5rem' }}>
        <span className="ubm-cota ubm-cota--muted">OFICIAL DO SITE</span>
        <p style={{ fontSize: '0.88rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.2rem' }}>
          Esta é a cor que todos veem.
        </p>
      </div>

      <fieldset
        className="ubm-official-switch"
        role="radiogroup"
        aria-label="Paleta oficial do site"
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        {paletas.map((paleta) => {
          const primaryColor = paleta.tokensLight?.['primary'] ?? '205 68% 33%'
          const accentColor = paleta.tokensLight?.['accent'] ?? '345 62% 30%'

          return (
            <div
              key={paleta.id}
              className="ubm-official-switch-option"
              role="radio"
              aria-checked={paleta.ativa}
              aria-disabled={!paleta.aprovadaAA ? 'true' : undefined}
              data-palette-id={paleta.id}
              tabIndex={paleta.aprovadaAA ? 0 : -1}
              onClick={() => paleta.aprovadaAA && handleSelecionar(paleta)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (paleta.aprovadaAA) handleSelecionar(paleta)
                }
              }}
              style={{ cursor: paleta.aprovadaAA ? 'pointer' : 'not-allowed' }}
            >
              {/* Swatches da tríade */}
              <div className="ubm-swatch-trio">
                <div className="ubm-swatch" style={{ '--swatch-color': primaryColor } as React.CSSProperties}>
                  <div className="ubm-swatch-dot" />
                  <span className="ubm-swatch-label">Primária</span>
                </div>
                <div className="ubm-swatch" style={{ '--swatch-color': accentColor } as React.CSSProperties}>
                  <div className="ubm-swatch-dot" />
                  <span className="ubm-swatch-label">Acento</span>
                </div>
              </div>

              {/* Nome + badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span
                  className="font-display"
                  style={{ fontSize: '0.95rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}
                >
                  {paleta.nome}
                </span>

                {paleta.aprovadaAA ? (
                  <span
                    className="ubm-aa-badge ubm-aa-badge--ok"
                    aria-label="Aprovada em AA"
                  >
                    <CheckCircle size={12} aria-hidden />
                    APROVADA
                  </span>
                ) : (
                  <span
                    className="ubm-aa-badge ubm-aa-badge--fail"
                    aria-label="Reprovada em AA — não pode ser ativada"
                    title="Não pode ser ativada: falha em AA"
                  >
                    <AlertTriangle size={12} aria-hidden />
                    REPROVADO
                  </span>
                )}

                {paleta.ativa && (
                  <span
                    className="ubm-stamp"
                    aria-label="Esta paleta está no ar — ativa site-wide"
                    style={{ transform: 'rotate(-2deg)', fontSize: '0.64rem' }}
                  >
                    <Radio size={10} aria-hidden />
                    NO AR
                  </span>
                )}
              </div>

              {/* CTA aparece na opção inativa em foco */}
              {!paleta.ativa && paleta.aprovadaAA && (
                <span
                  className="ubm-cota ubm-cota--muted"
                  style={{ fontSize: '0.62rem', marginTop: '0.15rem' }}
                >
                  Ativar no site
                </span>
              )}

              {/* Cota de auditoria */}
              {paleta.criadoEm && (
                <span className="ubm-cota ubm-cota--muted" style={{ fontSize: '0.6rem' }}>
                  #{paleta.id.slice(0, 8)} · por {paleta.adminEmail?.split('@')[0] ?? 'admin'}
                </span>
              )}
            </div>
          )
        })}
      </fieldset>

      {/* Modal de confirmação */}
      {pendente && (
        <ModalConfirm
          nome={pendente.nome}
          onConfirmar={handleConfirmar}
          onCancelar={handleCancelar}
          carregando={carregando}
        />
      )}

      {/* Toast de sucesso */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', bottom: '1.5rem', right: '1.5rem',
            background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
            padding: '0.75rem 1.25rem', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-md)', fontSize: '0.92rem', zIndex: 70,
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}
