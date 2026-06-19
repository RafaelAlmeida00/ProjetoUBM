/**
 * /dores — Vitrine pública de dores (RSC anônimo, RN17/CA17)
 * Visitante sem login vê dores publicadas + cursos sugeridos.
 * NÃO exige autenticação — middleware só protege /app e /admin.
 * Reusa .ubm-dor-grid / .ubm-dor-card (globals.css §004).
 */

import React from 'react'
import Link from 'next/link'
import { listarDoresVitrine } from '@/lib/data/dores'
import type { DorVitrine } from '@/lib/data/dores'
import { CURSOS_UBM } from '@/lib/courses'

function labelCurso(value: string): string {
  return CURSOS_UBM.find((c) => c.value === value)?.label ?? value
}

/**
 * Selo de estágio da dor (ADR-0002): chip discreto baseado no projeto_status.
 * "Publicada" → sem projeto ainda OU projeto em em_analise (ainda recrutando equipe — janela
 *               de indicação aberta; não "virou caso" ainda)
 * "Virou caso" → projeto ativo PÓS-indicação (aprovado, em_execucao, … exceto finalizado)
 * "Finalizado" → projeto com status=finalizado (marsala via ubm-status--finalizado)
 * Reusa classes .ubm-status existentes — zero hex novo.
 */
function SeloEstagio({ projeto_status }: { projeto_status?: string }) {
  if (projeto_status === 'finalizado') {
    return <span className="ubm-status ubm-status--finalizado">Finalizado</span>
  }
  if (!projeto_status || projeto_status === 'em_analise') {
    return <span className="ubm-status ubm-status--publicada">Publicada</span>
  }
  return <span className="ubm-status ubm-status--caso">Virou caso</span>
}

function DorVitrineCard({ dor }: { dor: DorVitrine }) {
  return (
    <li>
      <Link
        href={`/dores/${dor.id}`}
        className="ubm-dor-card"
        aria-label={`Ver dor de ${dor.empresa_nome}`}
      >
        <div className="ubm-dor-card-head">
          <span className="ubm-dor-card-empresa">{dor.empresa_nome}</span>
          {/* Selo de estágio (ADR-0002) */}
          <SeloEstagio projeto_status={dor.projeto_status} />
        </div>
        <p className="ubm-dor-card-desc">{dor.descricao}</p>
        {dor.cursos.length > 0 && (
          <div className="ubm-dor-card-cursos">
            {dor.cursos.map((c) => (
              <span key={c} className="ubm-dor-card-curso">
                {labelCurso(c)}
              </span>
            ))}
          </div>
        )}
        <div className="ubm-dor-card-foot">
          <span className="ubm-cota ubm-cota--muted">
            {dor.publicada_em
              ? new Date(dor.publicada_em).toLocaleDateString('pt-BR')
              : '—'}
          </span>
          <span className="ubm-cota ubm-cota--muted">Ver detalhe →</span>
        </div>
      </Link>
    </li>
  )
}

export default async function DoresVitrinePage() {
  const dores = await listarDoresVitrine()

  return (
    <main className="ubm-dores-vitrine-page">
      <div className="ubm-section">
        {/* Cabeçalho institucional — prova social (design-system.md) */}
        <header className="ubm-page-header">
          <span className="ubm-cota">Extensão UBM · Vitrine de dores</span>
          <h1 className="ubm-page-title">
            Dores reais de empresas reais —{' '}
            <span className="ubm-page-title-accent">resolvidas por quem está aprendendo a resolver.</span>
          </h1>
          <p className="ubm-page-lead">
            Empresas, startups e órgãos públicos do Sul Fluminense trouxeram seus desafios para os
            alunos da UBM. Foi assim que nasceu o <strong>Governo Presente!</strong>, com a Prefeitura
            de Barra Mansa. Cada dor publicada aqui pode virar o próximo projeto de extensão.
          </p>
        </header>

        {dores.length === 0 ? (
          <div className="ubm-empty">
            <div className="ubm-empty-node" aria-hidden="true" />
            <p className="ubm-empty-title">As primeiras dores chegam em breve.</p>
            <p className="ubm-empty-msg">
              Nenhuma dor foi publicada ainda. Que tal ser a primeira empresa da vitrine?{' '}
              <Link href="/propor" className="ubm-link">
                Proponha sua dor →
              </Link>
            </p>
          </div>
        ) : (
          <>
            <p className="ubm-dores-vitrine-contagem ubm-cota ubm-cota--muted">
              {dores.length} {dores.length === 1 ? 'dor publicada' : 'dores publicadas'}
            </p>
            <ul className="ubm-dor-grid ubm-reveal" aria-label="Lista de dores publicadas">
              {dores.map((dor) => (
                <DorVitrineCard key={dor.id} dor={dor} />
              ))}
            </ul>
          </>
        )}

        {/* CTA para propor */}
        <div className="ubm-dores-vitrine-cta">
          <p className="ubm-dores-vitrine-cta-txt">
            Sua empresa tem uma dor que a UBM pode resolver?
          </p>
          <Link href="/propor" className="ubm-btn ubm-btn-primary">
            Proponha sua dor →
          </Link>
        </div>
      </div>
    </main>
  )
}
