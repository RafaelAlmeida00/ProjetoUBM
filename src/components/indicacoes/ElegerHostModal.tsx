'use client'
/**
 * Modal de ELEIÇÃO de host (admin) — escolhe 1 coordenador indicado SEM fechar a equipe.
 * O projeto continua em em_analise (aberto a indicações) até o host fechar.
 * Também serve para TROCAR o host (mesmo seletor, callback diferente).
 */
import React, { useEffect, useRef, useState, useTransition } from 'react'
import type { Indicacao } from '@/lib/data/projetos'
import type { ActionResult } from '@/lib/actions/equipe'

export interface ElegerHostModalProps {
  projetoId: string
  indicacoes: Indicacao[]
  titulo?: string
  nomesIndicados?: Record<string, string>
  onFechar: () => void
  onConfirmar: (projetoId: string, hostPessoaId: string) => Promise<ActionResult>
}

export function ElegerHostModal({
  projetoId,
  indicacoes,
  titulo = 'Eleger host',
  nomesIndicados = {},
  onFechar,
  onConfirmar,
}: ElegerHostModalProps) {
  const [hostId, setHostId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const firstRef = useRef<HTMLButtonElement>(null)

  const coordenadores = indicacoes.filter((i) => !i.deleted_at && i.papel_pretendido === 'coordenador')

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFechar])

  const confirmar = () => {
    if (!hostId) { setErro('Escolha um coordenador para ser o host.'); return }
    setErro(null)
    startTransition(async () => {
      const res = await onConfirmar(projetoId, hostId)
      if (res.ok) onFechar()
      else setErro(res.error)
    })
  }

  return (
    <div className="ubm-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="eleger-host-title">
      <div className="ubm-team-builder ubm-modal ubm-machined">
        <div className="ubm-team-builder-header">
          <h2 id="eleger-host-title" className="ubm-confirm-title">{titulo}</h2>
          <button
            ref={firstRef}
            type="button"
            className="ubm-btn ubm-btn-ghost ubm-team-builder-close"
            aria-label="Fechar modal"
            onClick={onFechar}
          >
            ✕
          </button>
        </div>

        <p className="ubm-confirm-msg">
          Selecione 1 coordenador indicado como host. O projeto continua <strong>aberto a indicações</strong>
          {' '}até o host fechar a equipe.
        </p>

        <fieldset className="ubm-team-builder-membros">
          <legend className="ubm-cota">Coordenadores indicados</legend>
          {coordenadores.length === 0 ? (
            <p className="ubm-empty-msg">Nenhum coordenador se indicou neste projeto ainda.</p>
          ) : (
            <ul className="ubm-team-builder-lista" aria-label="Selecionar host">
              {coordenadores.map((ind) => {
                const nome = nomesIndicados[ind.pessoa_id] ?? ind.aluno_nome ?? 'Coordenador'
                return (
                  <li key={ind.id} className="ubm-team-builder-item">
                    <label className="ubm-team-builder-host-label">
                      <input
                        type="radio"
                        name="host"
                        value={ind.pessoa_id}
                        checked={hostId === ind.pessoa_id}
                        onChange={() => { setHostId(ind.pessoa_id); setErro(null) }}
                        aria-label={`Eleger ${nome} como host`}
                      />
                      <span className="ubm-team-builder-membro-nome">{nome}</span>
                      <span className="ubm-member-papel-chip ubm-member-papel-chip--coordenador">COORDENADOR</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </fieldset>

        {erro && <p role="alert" className="ubm-team-builder-erro">{erro}</p>}
        {isPending && (
          <div className="ubm-loader" aria-live="assertive">
            <p className="ubm-loader-msg">Elegendo host…</p>
          </div>
        )}

        <div className="ubm-confirm-actions">
          <button type="button" className="ubm-btn ubm-btn-ghost" onClick={onFechar} disabled={isPending}>
            Cancelar
          </button>
          <button type="button" className="ubm-btn ubm-btn-primary" onClick={confirmar} disabled={isPending}>
            Confirmar host
          </button>
        </div>
      </div>
    </div>
  )
}
