/**
 * T-O3.3 — S1 /casos/[id] · Detalhe público do caso (RSC anônimo)
 * Timeline HERO + equipe pública. Nome só com opt-in (RN24/CA24).
 * Indicações/tarefas/doc/log NUNCA aparecem (CA26).
 */

import React from 'react'
import { notFound } from 'next/navigation'
import {
  listarProjetosVitrine,
  obterEquipePublica,
  obterTimelinePublica,
} from '@/lib/data/projetos'
import { UbmTimeline } from '@/components/ubm-timeline'
import { UbmTeam } from '@/components/ubm-team'

interface Props {
  params: Promise<{ id: string }>
}

const STATUS_LABELS: Record<string, string> = {
  em_analise: 'EM ANÁLISE',
  aprovado: 'EQUIPE APROVADA',
  aguardando_proposta: 'AGUARDANDO PROPOSTA',
  proposta_em_analise: 'PROPOSTA EM ANÁLISE',
  proposta_aprovada: 'PROPOSTA APROVADA',
  em_execucao: 'EM EXECUÇÃO',
  finalizado: 'FINALIZADO',
}

export default async function CasoDetalhePage({ params }: Props) {
  const { id } = await params

  // Valida que o projeto existe e é público (RLS)
  const projetos = await listarProjetosVitrine()
  const projeto = projetos.find((p) => p.id === id)
  if (!projeto) return notFound()

  // Leituras via RPC SECURITY DEFINER (nunca select* de perfil para anon — RS9)
  const [timeline, equipe] = await Promise.all([
    obterTimelinePublica(id),
    obterEquipePublica(id),
  ])

  const statusLabel = STATUS_LABELS[projeto.status] ?? projeto.status.toUpperCase()
  const semEquipe = projeto.status === 'em_analise' && equipe.length === 0

  return (
    <main className="ubm-caso-detalhe ubm-section">
      {/* Cabeçalho-carimbo */}
      <header className="ubm-caso-header">
        <h1 className="ubm-caso-titulo font-display">Caso UBM</h1>
        <span className="ubm-cota">{statusLabel}</span>
      </header>

      {/* HERO: Timeline — a costura */}
      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="ubm-caso-section-title">
          Linha do tempo
        </h2>
        <UbmTimeline eventos={timeline} />
      </section>

      {/* Equipe pública */}
      <section aria-labelledby="equipe-heading">
        <h2 id="equipe-heading" className="ubm-caso-section-title">
          Equipe
        </h2>
        {semEquipe ? (
          <p className="ubm-cota ubm-cota--muted">Equipe ainda em formação.</p>
        ) : (
          <UbmTeam membros={equipe} />
        )}
      </section>
    </main>
  )
}
