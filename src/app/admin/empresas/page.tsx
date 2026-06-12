'use client'
import { useEffect, useState } from 'react'
import { GitMerge, Undo2, Loader2 } from 'lucide-react'
import {
  listarDuplicatasPosiveis,
  mergeEmpresa,
  desfazerMerge,
  type DuplicataPar,
} from '@/lib/actions/admin-empresas'

function ConfirmDialog({
  open,
  titulo,
  mensagem,
  onConfirm,
  onCancel,
}: {
  open: boolean
  titulo: string
  mensagem: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="ubm-modal-overlay" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="ubm-modal ubm-machined">
        <div className="ubm-confirm">
          <p className="ubm-confirm-title">{titulo}</p>
          <p className="ubm-confirm-msg">{mensagem}</p>
          <div className="ubm-confirm-actions">
            <button type="button" className="ubm-btn ubm-btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button type="button" className="ubm-btn ubm-btn-primary" onClick={onConfirm}>
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * T12 — /admin/empresas: duplicatas + merge/undo + lixeira.
 * Animação de entrelaçamento (peças a 45°) é narrativa — reduz para troca direta.
 */
export default function AdminEmpresasPage() {
  const [duplicatas, setDuplicatas] = useState<DuplicataPar[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmando, setConfirmando] = useState<DuplicataPar | null>(null)
  const [ultimoLogId, setUltimoLogId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    listarDuplicatasPosiveis().then((d) => {
      setDuplicatas(d)
      setLoading(false)
    })
  }, [])

  const mostrarToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 5000)
  }

  const handleMerge = async (par: DuplicataPar) => {
    setConfirmando(null)
    const res = await mergeEmpresa(par.a, par.b)
    if (res.ok) {
      setDuplicatas((prev) => prev.filter((p) => p.a !== par.a || p.b !== par.b))
      setUltimoLogId(res.log_id ?? null)
      mostrarToast('Empresas unidas.')
    }
  }

  const handleDesfazer = async () => {
    if (!ultimoLogId) return
    const res = await desfazerMerge(ultimoLogId)
    if (res.ok) {
      setUltimoLogId(null)
      mostrarToast('União desfeita.')
      // recarregar lista
      listarDuplicatasPosiveis().then(setDuplicatas)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem' }}>
        <Loader2 className="animate-spin" aria-hidden />
        <span>Carregando duplicatas…</span>
      </div>
    )
  }

  return (
    <div style={{ padding: 'clamp(1.25rem, 4vw, 2rem)' }}>
      <div style={{ marginBottom: '1rem' }}>
        <span className="ubm-cota">ADMIN · EMPRESAS</span>
      </div>
      <h1 className="font-display" style={{ fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 600, marginBottom: '1.5rem' }}>
        Empresas duplicadas
      </h1>

      {duplicatas.length === 0 ? (
        <div className="ubm-empty">
          <div className="ubm-empty-node" />
          <p className="ubm-empty-title">Nenhuma duplicata sugerida.</p>
          <p className="ubm-empty-msg">Tudo em dia — nenhum par de empresas semelhantes encontrado.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {duplicatas.map((par, idx) => (
            <div key={idx} className="ubm-machined" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span className="font-display" style={{ fontWeight: 600, fontSize: '1.1rem' }}>{par.nome_a}</span>
                  <span className="ubm-cota ubm-cota--muted" style={{ fontSize: '0.65rem' }}>↔</span>
                  <span className="font-display" style={{ fontWeight: 600, fontSize: '1.1rem' }}>{par.nome_b}</span>
                  <span className="ubm-cota" style={{ fontSize: '0.68rem', color: 'hsl(var(--warning))' }}>
                    {Math.round(par.sim * 100)}% similar
                  </span>
                </div>
                <button
                  type="button"
                  className="ubm-btn ubm-btn-secondary"
                  style={{ gap: '0.4rem', height: '2.4rem', fontSize: '0.88rem' }}
                  onClick={() => setConfirmando(par)}
                  aria-label={`Unir ${par.nome_a} e ${par.nome_b}`}
                >
                  <GitMerge size={15} aria-hidden />
                  Unir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmando)}
        titulo="Unir empresas"
        mensagem={confirmando ? `Você quis unir "${confirmando.nome_a}" e "${confirmando.nome_b}"? A perdedora vira a canônica. Tudo é reversível.` : ''}
        onConfirm={() => confirmando && handleMerge(confirmando)}
        onCancel={() => setConfirmando(null)}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', bottom: '1.5rem', right: '1.5rem',
            background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
            padding: '0.75rem 1.25rem', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-md)', fontSize: '0.92rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}
        >
          {toast}
          {ultimoLogId && (
            <button
              type="button"
              className="ubm-btn-ghost ubm-btn"
              style={{ height: '2rem', fontSize: '0.82rem', gap: '0.35rem' }}
              onClick={handleDesfazer}
            >
              <Undo2 size={13} aria-hidden />
              Desfazer
            </button>
          )}
        </div>
      )}
    </div>
  )
}
