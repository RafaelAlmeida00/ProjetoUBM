import { KpiCard } from './KpiCard'
import { EmptyState } from './EmptyState'
import { LoadingState } from './LoadingState'
import type { PainelEmpresa as PainelEmpresaDados } from '@/lib/data/analytics'

interface PainelEmpresaProps {
  dados: PainelEmpresaDados | null | undefined
  carregando?: boolean
}

/**
 * Bloco B2 — Empresa (Velocidade A — SEM carimbo, SEM nome de aluno — CA4/CA5a).
 * Só contagens agregadas. design §6.2.
 *
 * GARANTIA: nenhum slot para nome de aluno/membro (barreira no banco).
 * Se o dado trouxer nome = bug de banco, não de front.
 */
export function PainelEmpresa({ dados, carregando }: PainelEmpresaProps) {
  if (carregando) return <LoadingState mensagem="Carregando painel da empresa…" />

  if (!dados) {
    return (
      <EmptyState
        titulo="Sua empresa ainda não tem dores registradas."
        mensagem="Publique a primeira dor para ver os agregados aqui."
        cta={{ label: 'Publicar uma dor', href: '/app/dores/nova' }}
      />
    )
  }

  const totalDores = (dados.dores_rascunho ?? 0) + (dados.dores_em_moderacao ?? 0) + (dados.dores_publicadas ?? 0)
  const pctFinalizado =
    dados.total_projetos > 0
      ? Math.round(((dados.projetos_finalizados ?? 0) / dados.total_projetos) * 100)
      : 0

  return (
    <div className="ubm-bancada-bloco">
      <h2 className="ubm-cota" style={{ marginBottom: '0.75rem' }}>PAINEL DA EMPRESA</h2>
      {/* .ubm-kpi-grid — zero slot para nome de aluno (CA5a) */}
      <div className="ubm-kpi-grid">
        <KpiCard
          rotulo="Dores registradas"
          valor={totalDores}
          realce="primary"
          sublabel={`${dados.dores_publicadas ?? 0} publicadas`}
        />
        <KpiCard
          rotulo="Projetos derivados"
          valor={dados.projetos_derivados ?? 0}
          realce="primary"
        />
        <KpiCard
          rotulo="% finalizados"
          valor={`${pctFinalizado}%`}
          realce="accent"
          sublabel={`${dados.projetos_finalizados ?? 0} de ${dados.total_projetos ?? 0} projetos`}
        />
      </div>
      {/* IMPORTANTE: sem FrescorBadge (Velocidade A — CA3); sem coluna de pessoa (CA5a) */}
    </div>
  )
}
