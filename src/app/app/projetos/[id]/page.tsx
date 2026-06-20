/**
 * 009 T17 — /app/projetos/[id] consolidada em /app/dores/[dor_id].
 * A "Sala da equipe" (gestão, funções/tarefas, timeline, 006) migrou para o detalhe da dor
 * (T7-T13). Esta rota vira stub de redirect via lookup reverso projeto→dor.
 *
 * Sem oráculo de existência (RN13/CA5/CA6): projeto inexistente, soft-deleted ou sem acesso
 * retornam `null` de obterDorDoProjeto → notFound() GENÉRICO (resposta idêntica nos 3 casos).
 */
import { notFound, redirect } from 'next/navigation'
import { obterDorDoProjeto } from '@/lib/data/dores'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProjetoDetalhePage({ params }: Props) {
  const { id } = await params
  const dorId = await obterDorDoProjeto(id)
  if (!dorId) notFound()
  redirect(`/app/dores/${dorId}`)
}
