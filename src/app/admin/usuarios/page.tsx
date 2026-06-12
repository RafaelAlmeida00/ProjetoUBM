'use client'
import { useEffect, useState } from 'react'
import { Shield, ShieldOff, Loader2 } from 'lucide-react'
import {
  listarUsuarios,
  revogarAdmin,
  type UsuarioAdmin,
} from '@/lib/actions/admin-usuarios'

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
            <button type="button" className="ubm-btn ubm-btn-destructive" onClick={onConfirm}>
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * T10 — /admin/usuarios: gestão de papéis/admin.
 * Modo blueprint. Tabela on-brand com voz de arquivo.
 */
export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmando, setConfirmando] = useState<{ userId: string; nome: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    listarUsuarios().then((u) => {
      setUsuarios(u)
      setLoading(false)
    })
  }, [])

  const mostrarToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const handleRevogarAdmin = async (userId: string) => {
    const res = await revogarAdmin(userId)
    setConfirmando(null)
    if (res.ok) {
      setUsuarios((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_admin: false } : u)),
      )
      mostrarToast('Acesso de administrador revogado.')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem' }}>
        <Loader2 className="animate-spin" aria-hidden />
        <span>Carregando usuários…</span>
      </div>
    )
  }

  return (
    <div style={{ padding: 'clamp(1.25rem, 4vw, 2rem)' }}>
      <div style={{ marginBottom: '1rem' }}>
        <span className="ubm-cota">ADMIN</span>
      </div>
      <h1 className="font-display" style={{ fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 600, marginBottom: '1.5rem' }}>
        Usuários e papéis
      </h1>

      {usuarios.length === 0 ? (
        <div className="ubm-empty">
          <div className="ubm-empty-node" />
          <p className="ubm-empty-title">Nenhum usuário encontrado.</p>
        </div>
      ) : (
        <div className="ubm-machined" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                <th scope="col" className="ubm-cota ubm-cota--muted" style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>E-mail</th>
                <th scope="col" className="ubm-cota ubm-cota--muted" style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Papéis</th>
                <th scope="col" className="ubm-cota ubm-cota--muted" style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Admin</th>
                <th scope="col" className="ubm-cota ubm-cota--muted" style={{ padding: '0.75rem 1rem' }}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr
                  key={u.id}
                  style={{ borderBottom: '1px solid hsl(var(--border))', transition: 'background 0.12s ease' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--muted) / 0.4)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                >
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.92rem' }}>{u.email}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {u.papeis.map((p) => (
                        <span key={p} className="ubm-dor-card-curso">{p}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {u.is_admin ? (
                      <span className="ubm-cota" style={{ color: 'hsl(var(--accent))' }}>
                        <Shield size={12} aria-hidden /> ADMIN
                      </span>
                    ) : (
                      <span className="ubm-cota ubm-cota--muted">—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    {u.is_admin && (
                      <button
                        type="button"
                        className="ubm-btn ubm-btn-ghost"
                        style={{ height: '2.2rem', fontSize: '0.82rem', gap: '0.4rem' }}
                        onClick={() => setConfirmando({ userId: u.id, nome: u.email })}
                        aria-label={`Revogar admin de ${u.email}`}
                      >
                        <ShieldOff size={13} aria-hidden />
                        Revogar admin
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmando)}
        titulo="Revogar acesso de administrador"
        mensagem={`Remover acesso de administrador de ${confirmando?.nome}?`}
        onConfirm={() => confirmando && handleRevogarAdmin(confirmando.userId)}
        onCancel={() => setConfirmando(null)}
      />

      {toast && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem',
          background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
          padding: '0.75rem 1.25rem', borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-md)', fontSize: '0.92rem',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
