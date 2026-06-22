import { KpiCard } from './KpiCard'
import { EmptyState } from './EmptyState'
import { LoadingState } from './LoadingState'
import type { MeuResumo } from '@/lib/data/analytics'

interface PainelPessoalProps {
  dados: MeuResumo | null | undefined
  carregando?: boolean
}

/**
 * Bloco B1 — Painel Pessoal (Velocidade A — SEM carimbo — CA1/CA3).
 * KPIs por auth.uid() da view vw_meu_resumo. Zero FrescorBadge.
 * design §6.1.
 */
export function PainelPessoal({ dados, carregando }: PainelPessoalProps) {
  if (carregando) return <LoadingState mensagem="Preparando seu painel…" />

  if (!dados) {
    return (
      <EmptyState
        titulo="Seu painel começa aqui."
        mensagem="Quando você publicar dores ou entrar em projetos, seus números aparecem."
        cta={{ label: 'Propor uma dor', href: '/app/dores/nova' }}
      />
    )
  }

  const totalProjetos = (dados.projetos_membro_execucao ?? 0) + (dados.projetos_membro_finalizados ?? 0)

  return (
    <div className="ubm-bancada-bloco">
      <h2 className="ubm-cota" style={{ marginBottom: '0.75rem' }}>MEU PAINEL</h2>
      {/* .ubm-kpi-grid: grade 1→3 cols */}
      <div
        className="ubm-kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
          gap: '0.75rem',
        }}
      >
        <KpiCard
          rotulo="Minhas dores publicadas"
          valor={dados.minhas_dores_publicadas ?? 0}
          realce="primary"
        />
        <KpiCard
          rotulo="Projetos onde sou membro"
          valor={totalProjetos}
          realce="primary"
          sublabel={`${dados.projetos_membro_execucao ?? 0} em execução · ${dados.projetos_membro_finalizados ?? 0} finalizados`}
        />
        <KpiCard
          rotulo="Minhas tarefas abertas"
          valor={dados.minhas_tarefas_abertas ?? 0}
          realce="accent"
        />
      </div>
      {/* IMPORTANTE: sem FrescorBadge (Velocidade A — CA3) */}
    </div>
  )
}
