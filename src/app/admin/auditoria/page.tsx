'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { lerAudit, type AuditLog } from '@/lib/actions/admin-auditoria'

/**
 * T11 — /admin/auditoria: leitura append-only do log (ler_audit).
 * Voz de arquivo (ubm-cota protagonista). Expandir mostra old→new (output-encoded).
 */
export default function AdminAuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    lerAudit(100).then((data) => {
      setLogs(data)
      setLoading(false)
    })
  }, [])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const formatTs = (ts: string) => {
    try {
      return new Date(ts).toLocaleString('pt-BR')
    } catch {
      return ts
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem' }}>
        <Loader2 className="animate-spin" aria-hidden />
        <span>Carregando trilha de auditoria…</span>
      </div>
    )
  }

  return (
    <div style={{ padding: 'clamp(1.25rem, 4vw, 2rem)' }}>
      <div style={{ marginBottom: '1rem' }}>
        <span className="ubm-cota">ADMIN · AUDITORIA</span>
      </div>
      <h1 className="font-display" style={{ fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 600, marginBottom: '0.4rem' }}>
        Trilha de auditoria
      </h1>
      <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '1.5rem', fontSize: '0.92rem' }}>
        Tudo o que acontece na plataforma fica registrado aqui.
      </p>

      {logs.length === 0 ? (
        <div className="ubm-empty">
          <div className="ubm-empty-node" />
          <p className="ubm-empty-title">Nenhum registro no período.</p>
        </div>
      ) : (
        <div className="ubm-machined" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                <th scope="col" className="ubm-cota ubm-cota--muted" style={{ padding: '0.65rem 1rem', textAlign: 'left' }}>Op</th>
                <th scope="col" className="ubm-cota ubm-cota--muted" style={{ padding: '0.65rem 1rem', textAlign: 'left' }}>Tabela</th>
                <th scope="col" className="ubm-cota ubm-cota--muted" style={{ padding: '0.65rem 1rem', textAlign: 'left' }}>Ator</th>
                <th scope="col" className="ubm-cota ubm-cota--muted" style={{ padding: '0.65rem 1rem', textAlign: 'left' }}>Quando</th>
                <th scope="col"><span className="sr-only">Expandir</span></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isOpen = expanded.has(log.id)
                return (
                  <>
                    <tr
                      key={log.id}
                      style={{ borderBottom: isOpen ? 'none' : '1px solid hsl(var(--border))', cursor: 'pointer' }}
                      onClick={() => toggleExpand(log.id)}
                    >
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span className="ubm-cota" style={{ color: 'hsl(var(--foreground))' }}>{log.op}</span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span className="ubm-cota ubm-cota--muted">{log.tabela}</span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', fontSize: '0.88rem' }}>{log.ator}</td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span className="ubm-cota ubm-cota--muted" style={{ fontSize: '0.68rem' }}>{formatTs(log.timestamp)}</span>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={`Expandir registro ${log.id}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}
                          onClick={(e) => { e.stopPropagation(); toggleExpand(log.id) }}
                        >
                          {isOpen
                            ? <ChevronDown size={16} aria-hidden />
                            : <ChevronRight size={16} aria-hidden />}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${log.id}-detail`} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                        <td colSpan={5} style={{ padding: '0 1rem 0.85rem' }}>
                          <div className="ubm-machined" style={{ padding: '0.75rem', background: 'hsl(var(--muted) / 0.4)' }}>
                            <p className="ubm-cota ubm-cota--muted" style={{ marginBottom: '0.35rem' }}>ANTES → DEPOIS</p>
                            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {JSON.stringify({ old: log.old, new: log.new }, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
