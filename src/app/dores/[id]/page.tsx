/**
 * /dores/[id] — Detalhe público de dor publicada (RSC anônimo, RN17/CA17)
 * Mostra empresa, descrição, cursos sugeridos e anexos com link de download.
 * notFound() se dor não existir ou não for publicada — nunca vaza dados privados.
 * Signed URLs geradas server-side (bucket dor-anexos é privado — getPublicUrl proibido).
 */

import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import { obterDorPublica } from '@/lib/data/dores'
import { CURSOS_UBM } from '@/lib/courses'

interface Props {
  params: Promise<{ id: string }>
}

function labelCurso(value: string): string {
  return CURSOS_UBM.find((c) => c.value === value)?.label ?? value
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extLabel(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'PNG',
    'image/jpeg': 'JPG',
    'image/webp': 'WEBP',
    'application/pdf': 'PDF',
    'text/csv': 'CSV',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  }
  return map[mime] ?? mime
}

export default async function DorPublicaDetalhePage({ params }: Props) {
  const { id } = await params
  const dor = await obterDorPublica(id)

  // RLS já barra não-publicadas; retorna null → 404
  if (!dor) return notFound()

  return (
    <main className="ubm-dor-publica-detalhe ubm-section">
      {/* Trilha de navegação */}
      <nav aria-label="Caminho" className="ubm-breadcrumb">
        <Link href="/" className="ubm-link">Início</Link>
        <span aria-hidden="true">/</span>
        <Link href="/dores" className="ubm-link">Dores</Link>
        <span aria-hidden="true">/</span>
        <b>{dor.empresa_nome.toUpperCase()}</b>
      </nav>

      {/* Cabeçalho */}
      <header className="ubm-page-header">
        <span className="ubm-cota">Dor publicada</span>
        <div className="ubm-title-row">
          <h1 className="ubm-page-title">{dor.empresa_nome}</h1>
          <span className="ubm-status ubm-status--publicada">Publicada</span>
        </div>
        {dor.publicada_em && (
          <p className="ubm-cota ubm-cota--muted">
            Publicada em {new Date(dor.publicada_em).toLocaleDateString('pt-BR')}
          </p>
        )}
      </header>

      {/* Corpo */}
      <div className="ubm-article">
        {/* Descrição */}
        <section className="ubm-section-block" aria-labelledby="desc-heading">
          <h2 id="desc-heading" className="ubm-section-title">A dor, nas palavras da empresa</h2>
          <p className="ubm-prose">{dor.descricao}</p>
        </section>

        {/* Cursos sugeridos */}
        {dor.cursos.length > 0 && (
          <section className="ubm-section-block" aria-labelledby="cursos-heading">
            <h2 id="cursos-heading" className="ubm-section-title">Cursos que podem encaixar</h2>
            <div className="ubm-dor-card-cursos">
              {dor.cursos.map((c) => (
                <span key={c} className="ubm-dor-card-curso">
                  {labelCurso(c)}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Anexos */}
        {dor.anexos.length > 0 && (
          <section className="ubm-section-block" aria-labelledby="anexos-heading">
            <h2 id="anexos-heading" className="ubm-section-title">Anexos</h2>
            <ul className="ubm-attach-list" aria-label="Arquivos anexados à dor">
              {dor.anexos.map((a) => (
                <li key={a.id}>
                  {/* signed URL: bucket privado, TTL 3600s — nunca getPublicUrl */}
                  <a
                    href={a.signedUrl}
                    download={a.nome_original}
                    className="ubm-attach-item"
                    aria-label={`Baixar ${a.nome_original}`}
                  >
                    <Paperclip className="ubm-attach-item-icon" aria-hidden />
                    <div className="ubm-attach-item-body">
                      {/* Nome como texto puro (anti-XSS) */}
                      <span className="ubm-attach-item-name">{a.nome_original}</span>
                      <span className="ubm-attach-item-meta">
                        {extLabel(a.mime_type)} · {formatBytes(a.tamanho_bytes)}
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* CTA de volta */}
      <div className="ubm-page-actions">
        <Link href="/dores" className="ubm-btn ubm-btn-secondary">
          ← Ver todas as dores
        </Link>
        <Link href="/propor" className="ubm-btn ubm-btn-primary">
          Proponha sua dor →
        </Link>
      </div>
    </main>
  )
}
