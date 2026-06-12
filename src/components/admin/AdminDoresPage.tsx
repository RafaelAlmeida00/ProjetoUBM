'use client'
import { useState, useId, useRef, useEffect } from 'react'
import { Lock, Check, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { StatusDor } from '@/components/dores/StatusDor'
import { moderarDor } from '@/lib/actions/dor'
import { CURSOS_UBM } from '@/lib/courses'

export interface DorModeracaoItem {
  id: string
  empresa_nome: string
  descricao: string
  status: 'em_moderacao'
  cursos: string[]
  criada_em: string
  aprovado_por: string | null
  motivo_rejeicao: string | null
  /** null quando dor é órfã (enviada anonimamente, claim pendente — T-AN15/SR-A6). */
  autor_id: string | null
  /** false quando autor_id é null (órfã não-reclamada não tem conta verificada). */
  autor_verificado: boolean
}

interface AdminDoresPageProps {
  doresEmModeracao: DorModeracaoItem[]
  isAdmin: boolean
}

function labelCurso(value: string): string {
  return CURSOS_UBM.find((c) => c.value === value)?.label ?? value
}

interface ModalMotivo {
  dorId: string
  open: boolean
}

/**
 * T9 — /admin/dores: fila de moderação (aprovar/rejeitar com motivo).
 * Modo blueprint: mesh densa + voz mono + chip "MODO MODERAÇÃO".
 * Moderação exclusiva do admin (CA6); motivo obrigatório ao rejeitar (CA8).
 */
export function AdminDoresPage({ doresEmModeracao, isAdmin }: AdminDoresPageProps) {
  const dialogId = useId()
  const motivoId = `${dialogId}-motivo`
  const motivoRef = useRef<HTMLTextAreaElement>(null)

  const [selecionada, setSelecionada] = useState<DorModeracaoItem | null>(null)
  const [modal, setModal] = useState<ModalMotivo>({ dorId: '', open: false })
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastOk, setToastOk] = useState(true)
  // fila local (remove após decisão para dar feedback imediato)
  const [fila, setFila] = useState(doresEmModeracao)

  // Foca no textarea ao abrir modal
  useEffect(() => {
    if (modal.open) {
      setTimeout(() => motivoRef.current?.focus(), 50)
    }
  }, [modal.open])

  // Fecha modal com ESC
  useEffect(() => {
    if (!modal.open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharModal()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [modal.open])

  function fecharModal() {
    setModal({ dorId: '', open: false })
    setMotivo('')
  }

  function mostrarToast(msg: string, ok = true) {
    setToastMsg(msg)
    setToastOk(ok)
    setTimeout(() => setToastMsg(''), 4000)
  }

  async function handleAprovar(dorId: string) {
    setLoading(true)
    const result = await moderarDor(dorId, 'aprovar')
    setLoading(false)
    if (result.ok) {
      const dor = fila.find((d) => d.id === dorId)
      if (dor?.autor_verificado) {
        // publicada imediatamente (CA7)
        setFila((f) => f.filter((d) => d.id !== dorId))
        mostrarToast('Dor publicada. O autor foi avisado.')
      } else {
        // aprovada-aguardando-verificação (CA10)
        setFila((f) =>
          f.map((d) => (d.id === dorId ? { ...d, aprovado_por: 'admin' } : d)),
        )
        mostrarToast('Aprovada. Publicará quando o autor verificar o e-mail.')
      }
      if (selecionada?.id === dorId) setSelecionada(null)
    } else {
      mostrarToast('Não foi possível concluir a moderação.', false)
    }
  }

  async function handleConfirmarRejeicao() {
    if (!motivo.trim()) return
    setLoading(true)
    const result = await moderarDor(modal.dorId, 'rejeitar', motivo.trim())
    setLoading(false)
    fecharModal()
    if (result.ok) {
      setFila((f) => f.filter((d) => d.id !== modal.dorId))
      if (selecionada?.id === modal.dorId) setSelecionada(null)
      mostrarToast('Dor rejeitada. O autor foi avisado com o motivo.')
    } else {
      mostrarToast('Não foi possível concluir a moderação.', false)
    }
  }

  /* ── Não-admin: peça lacrada (CA6) ── */
  if (!isAdmin) {
    return (
      <section className="ubm-section" style={{ maxWidth: '40rem' }}>
        <div className="ubm-locked">
          <Lock className="ubm-locked-icon" aria-hidden />
          <span className="ubm-cota">RESTRITO</span>
          <p className="ubm-locked-title">Área restrita à moderação.</p>
          <p className="ubm-locked-msg">
            Acesso exclusivo ao time de moderação da UBM.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="ubm-section ubm-mesh" style={{ maxWidth: '72rem' }}>
      {/* ── Header blueprint ── */}
      <div className="ubm-stamp-header" style={{ marginBottom: '1.5rem' }}>
        <div className="ubm-stamp-header-trail">
          <span>ADMIN</span>
          <span>/</span>
          <b>DORES</b>
        </div>
        <div className="ubm-stamp-header-actions">
          <span className="ubm-navrail-mode">
            <span aria-hidden>⬡</span>
            Modo Moderação
          </span>
        </div>
      </div>

      {/* ── Contador da fila ── */}
      <p className="ubm-cota" style={{ marginBottom: '1rem' }}>
        Em Moderação · {fila.filter((d) => !d.aprovado_por).length}
        {fila.some((d) => d.aprovado_por) && (
          <span style={{ marginLeft: '1rem' }}>
            Aprovada · Aguarda Verificação · {fila.filter((d) => d.aprovado_por).length}
          </span>
        )}
      </p>

      {/* ── Fila vazia ── */}
      {fila.length === 0 && (
        <div className="ubm-empty">
          <div className="ubm-empty-node" aria-hidden />
          <p className="ubm-empty-title">Nenhuma dor aguardando moderação.</p>
          <p className="ubm-empty-msg">Tudo em dia — a fila está limpa.</p>
        </div>
      )}

      {/* ── Layout fila + detalhe ── */}
      {fila.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: selecionada ? '1fr 1.4fr' : '1fr', gap: '1.5rem' }}>
          {/* Lista */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {fila.map((dor) => (
              <li key={dor.id}>
                <button
                  type="button"
                  className={`ubm-dor-card${selecionada?.id === dor.id ? ' is-active' : ''}`}
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                  onClick={() => setSelecionada(dor)}
                  aria-pressed={selecionada?.id === dor.id}
                >
                  <div className="ubm-dor-card-head">
                    <span className="ubm-dor-card-empresa">{dor.empresa_nome}</span>
                    {dor.autor_id === null && (
                      <span className="ubm-status ubm-status--muted" title="Enviado anonimamente — claim pendente (T-AN15)">
                        lead não reclamado
                      </span>
                    )}
                    {dor.aprovado_por ? (
                      <span className="ubm-status ubm-status--aprovada">
                        <span aria-hidden>✓</span>
                        Aguarda Verificação
                      </span>
                    ) : (
                      <StatusDor status="em_moderacao" />
                    )}
                  </div>
                  <p className="ubm-dor-card-desc" style={{ WebkitLineClamp: 2, lineClamp: 2 }}>
                    {dor.descricao}
                  </p>
                  <span className="ubm-cota ubm-cota--muted">
                    {new Date(dor.criada_em).toLocaleDateString('pt-BR')}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Painel de detalhe */}
          {selecionada && (
            <div className="ubm-machined" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <h2 className="font-display" style={{ fontSize: '1.3rem', marginBottom: '0.25rem' }}>
                  {selecionada.empresa_nome}
                </h2>
                {selecionada.aprovado_por ? (
                  <div>
                    <span className="ubm-status ubm-status--aprovada">
                      <span aria-hidden>✓</span>
                      Aprovada · Aguarda Verificação
                    </span>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.88rem', color: 'hsl(var(--muted-foreground))' }}>
                      Aprovada. Vai ao ar assim que o autor verificar o e-mail.
                    </p>
                  </div>
                ) : (
                  <StatusDor status="em_moderacao" />
                )}
              </div>

              <p style={{ lineHeight: 1.65, color: 'hsl(var(--foreground))' }}>
                {selecionada.descricao}
              </p>

              {selecionada.cursos.length > 0 && (
                <div className="ubm-dor-card-cursos">
                  {selecionada.cursos.map((c) => (
                    <span key={c} className="ubm-dor-card-curso">{labelCurso(c)}</span>
                  ))}
                </div>
              )}

              {/* Barra de decisão */}
              {!selecionada.aprovado_por && (
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid hsl(var(--border))' }}>
                  <button
                    type="button"
                    className="ubm-btn ubm-btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => handleAprovar(selecionada.id)}
                    disabled={loading}
                  >
                    <Check size={16} aria-hidden />
                    Aprovar
                  </button>
                  <button
                    type="button"
                    className="ubm-btn ubm-btn-destructive"
                    style={{ flex: 1 }}
                    onClick={() => { setModal({ dorId: selecionada.id, open: true }); setMotivo('') }}
                    disabled={loading}
                  >
                    <X size={16} aria-hidden />
                    Rejeitar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Toast ── */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 80,
            padding: '0.75rem 1.25rem', borderRadius: 'var(--radius)',
            background: toastOk ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
            color: '#fff', fontWeight: 600, fontSize: '0.92rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {toastOk ? <CheckCircle2 size={16} aria-hidden /> : <AlertCircle size={16} aria-hidden />}
          {toastMsg}
        </div>
      )}

      {/* ── Modal de motivo de rejeição ── */}
      {modal.open && (
        <div className="ubm-modal-overlay" role="presentation">
          <div
            className="ubm-modal ubm-machined"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
          >
            <div className="ubm-confirm">
              <h2 id={`${dialogId}-title`} className="ubm-confirm-title">
                Por que esta dor precisa de ajustes?
              </h2>
              <p className="ubm-confirm-msg">
                O autor verá esta mensagem. Explique o que ele deve corrigir.
              </p>
              <div className="ubm-confirm-field">
                <label htmlFor={motivoId} style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                  Motivo <span style={{ color: 'hsl(var(--destructive))' }}>*</span>
                </label>
                <textarea
                  ref={motivoRef}
                  id={motivoId}
                  aria-label="Motivo"
                  aria-required="true"
                  aria-invalid={motivo.trim() === '' ? 'true' : 'false'}
                  aria-describedby={`${dialogId}-required`}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey && motivo.trim()) handleConfirmarRejeicao()
                    if (e.key === 'Escape') fecharModal()
                  }}
                  placeholder="Explique o que o autor deve corrigir. Ele verá esta mensagem."
                />
                <p id={`${dialogId}-required`} className="ubm-confirm-required">
                  Campo obrigatório.
                </p>
              </div>
              <div className="ubm-confirm-actions">
                <button
                  type="button"
                  className="ubm-btn ubm-btn-ghost"
                  onClick={fecharModal}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="ubm-btn ubm-btn-destructive"
                  onClick={handleConfirmarRejeicao}
                  disabled={!motivo.trim() || loading}
                >
                  Confirmar Rejeição
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
