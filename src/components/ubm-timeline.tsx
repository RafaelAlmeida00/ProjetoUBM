'use client'

/**
 * T-O3.1 — Componente UbmTimeline (.ubm-timeline)
 * A costura como linha do tempo. Semântica ol/li, estado nunca só-cor,
 * etapas futuras atenuadas/não-clicáveis, append-only visível, prefers-reduced-motion.
 * design.md §3.1/§4, tokens derivados de globals.css.
 */

import React from 'react'
import type { EventoTimeline } from '@/lib/data/projetos'

// Rótulos e pinos por status_projeto (§2.3 design.md — nunca cor sozinha)
const STATUS_LABELS: Record<string, string> = {
  em_analise: 'EM ANÁLISE',
  aprovado: 'EQUIPE APROVADA',
  aguardando_proposta: 'AGUARDANDO PROPOSTA',
  proposta_em_analise: 'PROPOSTA EM ANÁLISE',
  proposta_aprovada: 'PROPOSTA APROVADA',
  em_execucao: 'EM EXECUÇÃO',
  finalizado: 'FINALIZADO',
}

// Classes de cor por status (derivam de tokens — design §2.3)
const STATUS_CLASSES: Record<string, string> = {
  em_analise: 'ubm-timeline-pin--analise',
  aprovado: 'ubm-timeline-pin--aprovado',
  aguardando_proposta: 'ubm-timeline-pin--aguardando',
  proposta_em_analise: 'ubm-timeline-pin--proposta',
  proposta_aprovada: 'ubm-timeline-pin--proposta-aprovada',
  em_execucao: 'ubm-timeline-pin--execucao',
  finalizado: 'ubm-timeline-pin--finalizado',
}

// Estados da 006 (futuros, atenuados na 005)
const ESTADOS_006 = new Set([
  'proposta_em_analise',
  'proposta_aprovada',
  'em_execucao',
  'finalizado',
])

function formatarData(iso: string): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso)).toUpperCase()
  } catch {
    return iso
  }
}

export interface UbmTimelineProps {
  eventos: (EventoTimeline & { futuro?: boolean })[]
  /** Modo compacto (para uso em S3 — projeto-detalhe) */
  compacto?: boolean
}

export function UbmTimeline({ eventos, compacto = false }: UbmTimelineProps) {
  if (eventos.length === 0) {
    return (
      <div className="ubm-timeline ubm-timeline--empty">
        <div className="ubm-empty">
          <div className="ubm-empty-node" aria-hidden="true" />
          <p className="ubm-empty-msg">A linha do tempo aparece quando o projeto avança.</p>
        </div>
      </div>
    )
  }

  // A etapa atual é a última sem futuro=true
  const ultimoIndex = (() => {
    for (let i = eventos.length - 1; i >= 0; i--) {
      if (!(eventos[i] as EventoTimeline & { futuro?: boolean }).futuro) return i
    }
    return 0
  })()

  return (
    <div className={`ubm-timeline${compacto ? ' ubm-timeline--compact' : ''}`}>
      {/* Linha-costura decorativa (aria-hidden — sentido está na lista) */}
      <div className="ubm-timeline-line" aria-hidden="true" />

      <ol className="ubm-timeline-list" aria-label="Linha do tempo do projeto">
        {eventos.map((evt, i) => {
          const ehFuturo = !!(evt as EventoTimeline & { futuro?: boolean }).futuro ||
            (ESTADOS_006.has(evt.para_status) && !evt.ocorrido_em)
          const ehAtual = i === ultimoIndex && !ehFuturo
          const rotulo = STATUS_LABELS[evt.para_status] ?? evt.para_status.replace(/_/g, ' ').toUpperCase()
          const pinClass = STATUS_CLASSES[evt.para_status] ?? ''

          return (
            <li
              key={`${evt.para_status}-${i}`}
              className={[
                'ubm-timeline-step',
                ehFuturo ? 'ubm-timeline-step--future' : 'ubm-timeline-step--past',
                ehAtual ? 'ubm-timeline-step--current' : '',
              ].filter(Boolean).join(' ')}
              aria-disabled={ehFuturo ? 'true' : undefined}
              data-future={ehFuturo ? 'true' : undefined}
              aria-label={[
                'Etapa:',
                rotulo,
                evt.ocorrido_em ? `— ${formatarData(evt.ocorrido_em)}` : '',
                evt.autor_nome ? `, por ${evt.autor_nome}` : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Pino-nó: cor + forma + rótulo (nunca só cor — a11y) */}
              <span
                className={`ubm-timeline-pin ubm-clip-node ${pinClass}${ehFuturo ? ' ubm-timeline-pin--future' : ''}${ehAtual ? ' ubm-timeline-pin--current' : ''}`}
                aria-hidden="true"
              />

              <div className="ubm-timeline-step-body ubm-machined">
                {/* Rótulo do estado (textual — nunca só cor) */}
                <span className="ubm-cota ubm-timeline-step-status">
                  {rotulo}
                </span>

                {/* Cota ATUAL ou A SEGUIR */}
                {ehAtual && (
                  <span className="ubm-cota ubm-timeline-step-badge ubm-timeline-step-badge--atual">
                    ATUAL
                  </span>
                )}
                {ehFuturo && (
                  <span className="ubm-cota ubm-cota--muted ubm-timeline-step-badge ubm-timeline-step-badge--future">
                    A SEGUIR
                  </span>
                )}

                {/* Data formatada em PT-BR */}
                {evt.ocorrido_em && (
                  <time
                    className="ubm-cota ubm-cota--muted ubm-timeline-step-date"
                    dateTime={evt.ocorrido_em}
                  >
                    {formatarData(evt.ocorrido_em)}
                  </time>
                )}

                {/* Autor da transição (nome revelado p/ interno/opt-in; oculto caso contrário) */}
                {evt.autor_nome && (
                  <span className="ubm-timeline-step-ator">
                    {evt.autor_nome}
                  </span>
                )}

                {/* Motivo (se houver, ≤60ch) */}
                {(evt as EventoTimeline & { motivo?: string }).motivo && (
                  <p className="ubm-timeline-step-motivo">
                    {(evt as EventoTimeline & { motivo?: string }).motivo}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
