'use client'
import { useEffect, useState } from 'react'
import { Stamp, Loader2 } from 'lucide-react'
import {
  proposeBackfillEmpresas,
  fixarGrupo,
  type GrupoBackfill,
} from '@/lib/actions/admin-backfill'
import { useToast } from '@/components/feedback/ToastProvider'

function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="ubm-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmar fixação do grupo">
      <div className="ubm-modal ubm-machined">
        <div className="ubm-confirm">
          <p className="ubm-confirm-title">Fixar grupo de empresas?</p>
          <p className="ubm-confirm-msg">
            Confira a empresa canônica de cada grupo antes de fixar — depois disso, as dores
            apontarão para ela. Revise com atenção: isto consolida nomes.
          </p>
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
 * T13 — /admin/backfill: revisar grupos do legado e fixar.
 * Prepara o terreno para o backfill proposal→dor (migr. 0021).
 */
export default function AdminBackfillPage() {
  const toast = useToast()

  const [grupos, setGrupos] = useState<GrupoBackfill[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)

  useEffect(() => {
    proposeBackfillEmpresas().then((g) => {
      setGrupos(g)
      setLoading(false)
    })
  }, [])

  const handleFixar = async (grupoId: string) => {
    setConfirmandoId(null)
    const res = await fixarGrupo(grupoId)
    if (res.ok) {
      setGrupos((prev) => prev.filter((g) => g.grupo_id !== grupoId))
      toast.sucesso('Grupo fixado.')
    } else {
      toast.erro('Não foi possível fixar o grupo. Tente novamente.')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem' }}>
        <Loader2 className="animate-spin" aria-hidden />
        <span>Carregando grupos de backfill…</span>
      </div>
    )
  }

  return (
    <div style={{ padding: 'clamp(1.25rem, 4vw, 2rem)' }}>
      <div style={{ marginBottom: '1rem' }}>
        <span className="ubm-cota">ADMIN · BACKFILL</span>
      </div>
      <h1 className="font-display" style={{ fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 600, marginBottom: '0.4rem' }}>
        Backfill de empresas
      </h1>
      <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '1.5rem', fontSize: '0.92rem' }}>
        Confira a empresa canônica de cada grupo antes de fixar — depois disso, as dores
        apontarão para ela.
      </p>

      {grupos.length === 0 ? (
        <div className="ubm-empty">
          <div className="ubm-empty-node" />
          <p className="ubm-empty-title">Nada pendente de backfill.</p>
          <p className="ubm-empty-msg">Todos os grupos já foram fixados.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {grupos.map((grupo) => (
            <div key={grupo.grupo_id} className="ubm-machined" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <p className="ubm-cota ubm-cota--muted" style={{ marginBottom: '0.5rem' }}>
                    CANÔNICA SUGERIDA
                  </p>
                  <p className="font-display" style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    {grupo.canonico_sugerido.nome}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {grupo.grafias.map((g) => (
                      <span key={g} className="ubm-dor-card-curso">{g}</span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="ubm-btn ubm-btn-primary"
                  style={{ gap: '0.4rem', height: '2.4rem', fontSize: '0.88rem' }}
                  onClick={() => setConfirmandoId(grupo.grupo_id)}
                  aria-label={`Fixar grupo ${grupo.canonico_sugerido.nome}`}
                >
                  <Stamp size={15} aria-hidden />
                  Fixar grupo
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmandoId)}
        onConfirm={() => confirmandoId && handleFixar(confirmandoId)}
        onCancel={() => setConfirmandoId(null)}
      />

    </div>
  )
}
