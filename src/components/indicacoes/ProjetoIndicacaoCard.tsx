'use client'
/**
 * Onda 2 — B5: card canônico para "Projetos disponíveis" em /app/indicacoes.
 * Reutiliza as mesmas classes do DorCardItem: article + link-no-título + MeIndicarSlot.
 * Sem nesting <a><button> (WAI-ARIA stretched-link pattern).
 */
import { MeIndicarSlot, type EstadoIndicacao } from '@/components/dores/MeIndicarSlot'
import { CURSOS_UBM } from '@/lib/courses'

interface ProjetoIndicacaoCardProps {
  projetoId: string
  dorId: string
  empresaNome: string
  descricao: string
  cursos: string[]
  papelBase: 'aluno' | 'coordenador'
  estadoIndicacao: EstadoIndicacao
  onIndicar: (id: string, papel: 'aluno' | 'coordenador') => Promise<{ ok: boolean; error?: string }>
  onRetirar: (id: string) => Promise<{ ok: boolean; error?: string }>
}

function labelCurso(value: string): string {
  return CURSOS_UBM.find((c) => c.value === value)?.label ?? value
}

export function ProjetoIndicacaoCard({
  projetoId,
  dorId,
  empresaNome,
  descricao,
  cursos,
  papelBase,
  estadoIndicacao,
  onIndicar,
  onRetirar,
}: ProjetoIndicacaoCardProps) {
  return (
    <article className="ubm-dor-card ubm-dor-card--linkable">
      <div className="ubm-dor-card-head">
        <h3 className="ubm-dor-card-empresa">
          <a
            href={`/app/dores/${dorId}`}
            className="ubm-dor-card-link"
            aria-label={`Ver dor de ${empresaNome}`}
          >
            {empresaNome}
          </a>
        </h3>
      </div>

      <p className="ubm-dor-card-desc">{descricao}</p>

      {cursos.length > 0 && (
        <div className="ubm-dor-card-cursos">
          {cursos.map((c) => (
            <span key={c} className="ubm-dor-card-curso">{labelCurso(c)}</span>
          ))}
        </div>
      )}

      <div className="ubm-dor-card-foot ubm-card-action-row">
        <MeIndicarSlot
          projetoId={projetoId}
          empresaNome={empresaNome}
          papelBase={papelBase}
          estado={estadoIndicacao}
          onIndicar={onIndicar}
          onRetirar={onRetirar}
        />
      </div>
    </article>
  )
}
