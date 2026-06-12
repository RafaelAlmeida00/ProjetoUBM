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
          <span className="ubm-status ubm-status--publicada">Publicada</span>
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
        <header className="ubm-dores-vitrine-header">
          <span className="ubm-cota">Extensão UBM · Dores reais</span>
          <h1 className="ubm-dores-vitrine-titulo font-display">
            Dores reais.<br />
            <span className="ubm-dores-vitrine-titulo-destaque">Soluções reais.</span>
          </h1>
          <p className="ubm-dores-vitrine-subtitulo">
            Empresas, startups e órgãos públicos do Sul Fluminense que trouxeram seus desafios
            para os alunos da UBM resolverem. Cada dor publicada pode virar um projeto de extensão.
          </p>
        </header>

        {dores.length === 0 ? (
          <div className="ubm-empty">
            <div className="ubm-empty-node" aria-hidden="true" />
            <p className="ubm-empty-title">As primeiras dores chegam em breve.</p>
            <p className="ubm-empty-msg">
              Nenhuma dor foi publicada ainda. Quer ser o primeiro?{' '}
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
            <ul className="ubm-dor-grid" aria-label="Lista de dores publicadas">
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
