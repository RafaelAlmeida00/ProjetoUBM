/**
 * T-O3.3 — S1 /casos · Vitrine pública RSC (anônimo)
 * design.md §S1 — timeline HERO + equipe; nome só com opt-in;
 * indicações/tarefas/doc/log NUNCA aparecem (CA26).
 * RLS pública de `projeto` (deleted_at is null).
 */

import React from 'react'
import Link from 'next/link'
import { listarProjetosVitrine } from '@/lib/data/projetos'
import type { ProjetoVitrine } from '@/lib/data/projetos'

const STATUS_LABELS: Record<string, string> = {
  em_analise: 'EM ANÁLISE',
  aprovado: 'EQUIPE APROVADA',
  aguardando_proposta: 'AGUARDANDO PROPOSTA',
  proposta_em_analise: 'PROPOSTA EM ANÁLISE',
  proposta_aprovada: 'PROPOSTA APROVADA',
  em_execucao: 'EM EXECUÇÃO',
  finalizado: 'FINALIZADO',
}

const STATUS_CLASSES: Record<string, string> = {
  em_analise: 'ubm-status--moderacao',
  aprovado: 'ubm-status--aprovada',
  aguardando_proposta: 'ubm-status--moderacao',
  finalizado: 'ubm-status--publicada',
}

export default async function CasosPage() {
  const projetos = await listarProjetosVitrine()

  return (
    <main className="ubm-casos-page">
      <div className="ubm-section">
        <h1 className="ubm-casos-titulo font-display">Casos UBM</h1>
        <p className="ubm-casos-subtitulo">
          Veja a engenharia da UBM resolvendo dores reais — etapa por etapa.
        </p>

        {projetos.length === 0 ? (
          <div className="ubm-empty">
            <div className="ubm-empty-node" aria-hidden="true" />
            <p className="ubm-empty-title">Os primeiros casos chegam em breve.</p>
            <p className="ubm-empty-msg">
              Os primeiros casos da UBM aparecerão aqui em breve.
            </p>
          </div>
        ) : (
          <ul className="ubm-casos-grid ubm-dor-grid" aria-label="Lista de casos">
            {projetos.map((projeto) => (
              <CasoCard key={projeto.id} projeto={projeto} />
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

function CasoCard({ projeto }: { projeto: ProjetoVitrine }) {
  const statusLabel = STATUS_LABELS[projeto.status] ?? projeto.status.toUpperCase()
  const statusClass = STATUS_CLASSES[projeto.status] ?? ''

  return (
    <li>
      <Link
        href={`/casos/${projeto.id}`}
        className="ubm-dor-card"
        aria-label={`Ver caso ${projeto.id}`}
      >
        <div className="ubm-dor-card-head">
          <span className={`ubm-status ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        <div className="ubm-dor-card-foot">
          <span className="ubm-cota ubm-cota--muted">
            {projeto.status === 'em_analise' ? 'Equipe ainda em formação.' : 'Ver linha do tempo →'}
          </span>
        </div>
      </Link>
    </li>
  )
}
