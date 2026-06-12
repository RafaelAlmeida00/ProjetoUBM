'use client'
/**
 * T21 — ListaPaletas (Zona C)
 *
 * Lista oficiais + por empresa com status (NO AR / APROVADA·AA / EXCLUÍDA / DESATIVADA·EMPRESA AUSENTE).
 * Status sempre com ícone+rótulo, nunca cor sozinha (a11y).
 * Excluir → modal .ubm-confirm → excluirPaleta (soft-delete).
 * Restaurar → restaurarPaleta.
 * Cota de auditoria por card (CA17).
 * CA9b / CA15 / CA16 / design §5.4.
 */
import { useState, useCallback, useEffect } from 'react'
import { Radio, Archive, Unlink, ShieldCheck } from 'lucide-react'
import { excluirPaleta, restaurarPaleta } from '@/lib/actions/admin-paletas'

export interface PaletaItem {
  id: string
  nome: string
  escopo: 'oficial' | 'empresa'
  empresaId: string | null
  empresaNome?: string | null
  ativa: boolean
  aprovadaAA: boolean
  tokensLight: Record<string, string>
  tokensDark: Record<string, string>
  criadoEm?: string
  adminEmail?: string
  deletedAt: string | null
  empresaAusente: boolean
}

interface ListaPaletasProps {
  oficiais: PaletaItem[]
  empresa: PaletaItem[]
  onExcluida?: (id: string) => void
  onRestaurada?: (id: string) => void
}

interface ModalExcluirProps {
  nome: string
  onConfirmar: () => void
  onCancelar: () => void
  carregando: boolean
}

function ModalExcluir({ nome, onConfirmar, onCancelar, carregando }: ModalExcluirProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelar()
      if (e.key === 'Enter') onConfirmar()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onConfirmar, onCancelar])

  return (
    <div className="ubm-modal-overlay" role="dialog" aria-modal="true" aria-label="Excluir paleta">
      <div className="ubm-modal ubm-machined">
        <div className="ubm-confirm">
          <p className="ubm-confirm-title">Excluir esta paleta?</p>
          <p className="ubm-confirm-msg">
            <strong>{nome}</strong> sai de circulação, mas você pode restaurar depois. Nada é apagado.
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
              className="ubm-btn ubm-btn-destructive"
              onClick={onConfirmar}
              disabled={carregando}
              aria-busy={carregando}
            >
              {carregando ? 'Excluindo…' : 'Excluir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Formata data ISO para PT-BR curto */
function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

interface PaletaCardProps {
  paleta: PaletaItem
  onExcluir: (p: PaletaItem) => void
  onRestaurar: (p: PaletaItem) => void
  restaurando: boolean
}

function PaletaCard({ paleta, onExcluir, onRestaurar, restaurando }: PaletaCardProps) {
  const primaryColor = paleta.tokensLight?.['primary'] ?? '205 68% 33%'
  const accentColor  = paleta.tokensLight?.['accent']  ?? '345 62% 30%'
  const ringColor    = paleta.tokensLight?.['ring']     ?? '205 68% 33%'

  // Status da paleta
  const statusInfo = (() => {
    if (paleta.deletedAt) {
      return {
        cls: 'ubm-status--rejeitada',
        icon: <Archive size={11} aria-hidden />,
        label: 'EXCLUÍDA',
      }
    }
    if (paleta.empresaAusente) {
      return {
        cls: 'ubm-status--rascunho',
        icon: <Unlink size={11} aria-hidden />,
        label: 'DESATIVADA · EMPRESA AUSENTE',
      }
    }
    if (paleta.ativa) {
      return {
        cls: 'ubm-status--publicada',
        icon: <Radio size={11} aria-hidden />,
        label: 'NO AR',
      }
    }
    return {
      cls: 'ubm-status--aprovada',
      icon: <ShieldCheck size={11} aria-hidden />,
      label: 'APROVADA · AA',
    }
  })()

  const nomeExibicao = paleta.escopo === 'empresa'
    ? (paleta.empresaNome ?? paleta.nome)
    : paleta.nome

  return (
    <li
      role="listitem"
      className={`ubm-palette-card${paleta.ativa ? ' ubm-palette-card--ativa' : ''}${paleta.deletedAt ? ' ubm-palette-card--excluida' : ''}`}
    >
      <div className="ubm-palette-card-head">
        {/* Swatch trio */}
        <div className="ubm-swatch-trio">
          <div className="ubm-swatch" style={{ '--swatch-color': primaryColor } as React.CSSProperties}>
            <div className="ubm-swatch-dot" aria-hidden />
            <span className="ubm-swatch-label">P</span>
          </div>
          <div className="ubm-swatch" style={{ '--swatch-color': accentColor } as React.CSSProperties}>
            <div className="ubm-swatch-dot" aria-hidden />
            <span className="ubm-swatch-label">A</span>
          </div>
          <div className="ubm-swatch" style={{ '--swatch-color': ringColor } as React.CSSProperties}>
            <div className="ubm-swatch-dot" aria-hidden />
            <span className="ubm-swatch-label">R</span>
          </div>
        </div>

        {/* Status */}
        <span className={`ubm-status ${statusInfo.cls}`}>
          {statusInfo.icon}
          {statusInfo.label}
        </span>
      </div>

      {/* Nome */}
      <p className="ubm-palette-card-nome">{nomeExibicao}</p>

      {/* Cota de auditoria (CA17) */}
      <span className="ubm-cota ubm-cota--muted" style={{ fontSize: '0.6rem' }}>
        #{paleta.id.slice(0, 8)}
        {paleta.adminEmail && ` · por ${paleta.adminEmail.split('@')[0]}`}
        {paleta.criadoEm && ` · ${formatarData(paleta.criadoEm)}`}
      </span>

      {/* Ações */}
      <div className="ubm-palette-card-actions">
        {!paleta.deletedAt && !paleta.ativa && (
          <button
            type="button"
            className="ubm-btn ubm-btn-ghost"
            style={{ height: '2rem', fontSize: '0.78rem' }}
            onClick={() => onExcluir(paleta)}
            aria-label={`Excluir paleta${nomeExibicao ? ` de ${nomeExibicao}` : ''}`}
          >
            <Archive size={13} aria-hidden />
            Excluir
          </button>
        )}
        {paleta.deletedAt && (
          <button
            type="button"
            className="ubm-btn ubm-btn-secondary"
            style={{ height: '2rem', fontSize: '0.78rem' }}
            onClick={() => onRestaurar(paleta)}
            disabled={restaurando}
            aria-label={`Restaurar paleta${nomeExibicao ? ` de ${nomeExibicao}` : ''}`}
            aria-busy={restaurando}
          >
            {restaurando ? 'Restaurando…' : 'Restaurar'}
          </button>
        )}
      </div>
    </li>
  )
}

export function ListaPaletas({ oficiais, empresa, onExcluida, onRestaurada }: ListaPaletasProps) {
  const [pendenteExcluir, setPendenteExcluir] = useState<PaletaItem | null>(null)
  const [carregandoExcluir, setCarregandoExcluir] = useState(false)
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const mostrarToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const handleExcluir = useCallback((paleta: PaletaItem) => {
    setPendenteExcluir(paleta)
  }, [])

  const handleConfirmarExcluir = useCallback(async () => {
    if (!pendenteExcluir) return
    setCarregandoExcluir(true)
    const result = await excluirPaleta(pendenteExcluir.id)
    setCarregandoExcluir(false)
    setPendenteExcluir(null)
    if (result.ok) {
      mostrarToast(`Paleta "${pendenteExcluir.nome}" fora de circulação — restaurável.`)
      onExcluida?.(pendenteExcluir.id)
    }
  }, [pendenteExcluir, onExcluida])

  const handleCancelarExcluir = useCallback(() => {
    setPendenteExcluir(null)
  }, [])

  const handleRestaurar = useCallback(async (paleta: PaletaItem) => {
    setRestaurandoId(paleta.id)
    const result = await restaurarPaleta(paleta.id)
    setRestaurandoId(null)
    if (result.ok) {
      mostrarToast(`Paleta restaurada.`)
      onRestaurada?.(paleta.id)
    }
  }, [onRestaurada])

  return (
    <>
      {/* Seção: OFICIAIS */}
      <div style={{ marginBottom: '1.5rem' }}>
        <span className="ubm-cota ubm-cota--muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
          OFICIAIS
        </span>
        {oficiais.length === 0 ? (
          <div className="ubm-empty" style={{ padding: '1.25rem 0' }}>
            <p className="ubm-empty-msg" style={{ fontSize: '0.88rem' }}>Nenhuma paleta oficial cadastrada.</p>
          </div>
        ) : (
          <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', listStyle: 'none', padding: 0, margin: 0 }}>
            {oficiais.map((p) => (
              <PaletaCard
                key={p.id}
                paleta={p}
                onExcluir={handleExcluir}
                onRestaurar={handleRestaurar}
                restaurando={restaurandoId === p.id}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Seção: POR EMPRESA */}
      <div>
        <span className="ubm-cota ubm-cota--muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
          POR EMPRESA
        </span>
        {empresa.length === 0 ? (
          <div className="ubm-empty">
            <div className="ubm-empty-node" aria-hidden />
            <p className="ubm-empty-title" style={{ fontSize: '1rem' }}>Nenhuma empresa tem cor própria ainda.</p>
            <p className="ubm-empty-msg">Crie no editor acima.</p>
          </div>
        ) : (
          <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', listStyle: 'none', padding: 0, margin: 0 }}>
            {empresa.map((p) => (
              <PaletaCard
                key={p.id}
                paleta={p}
                onExcluir={handleExcluir}
                onRestaurar={handleRestaurar}
                restaurando={restaurandoId === p.id}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Modal de confirmação de exclusão */}
      {pendenteExcluir && (
        <ModalExcluir
          nome={pendenteExcluir.nome}
          onConfirmar={handleConfirmarExcluir}
          onCancelar={handleCancelarExcluir}
          carregando={carregandoExcluir}
        />
      )}

      {/* Toast */}
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
