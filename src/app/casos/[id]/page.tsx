/**
 * ADR-0002 — /casos/[id] → redirect 301 para /dores/{dor_id}
 * Resolve o dor_id do projeto (via listarProjetosVitrine) e redireciona.
 * Preserva links/SEO externos — NÃO deletar este arquivo.
 * Remoção física só após 1 ciclo sem tráfego (ADR-0002 §consequências).
 */

import { redirect, notFound } from 'next/navigation'
import { listarProjetosVitrine } from '@/lib/data/projetos'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CasosDetalhePage({ params }: Props) {
  const { id } = await params

  // Resolve dor_id do projeto para construir a URL canônica
  const projetos = await listarProjetosVitrine()
  const projeto = projetos.find((p) => p.id === id)

  if (!projeto) return notFound()

  redirect(`/dores/${projeto.dor_id}`)
}
