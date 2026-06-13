import { ArrowRight, CheckCircle2 } from 'lucide-react'

/** Tipo de estágio do ciclo dor→caso (ADR-0002). */
export type EstagioSoloTipo = 'caso' | 'finalizado'

/**
 * Deriva o tipo de estágio a partir do projeto_status da dor.
 * - undefined → sem projeto → undefined (sem selo)
 * - "finalizado" → selo marsala "FINALIZADO"
 * - qualquer outro valor ativo → selo azul "VIROU CASO"
 *
 * O ciclo de moderação (StatusDor) é ortogonal — este componente trata
 * apenas o ciclo de vida do caso após a dor estar publicada.
 */
export function derivarEstagioSelo(
  projeto_status: string | undefined,
): EstagioSoloTipo | undefined {
  if (!projeto_status) return undefined
  if (projeto_status === 'finalizado') return 'finalizado'
  return 'caso'
}

interface EstagioSeloProps {
  estagio: EstagioSoloTipo | undefined
}

/**
 * Chip discreto que mostra o estágio do caso (ADR-0002).
 * Espelha o padrão de <StatusDor>: .ubm-status + modifier.
 * Classes .ubm-status--caso / .ubm-status--finalizado já existem em globals.css.
 * Renderiza null quando estagio é undefined (dor publicada sem projeto).
 *
 * Posição: .ubm-dor-card-foot (ao lado da data no card) ou header da jornada em /dores/[id].
 * a11y: rótulo textual sempre presente; ícone aria-hidden (cor nunca sozinha).
 */
export function EstagioSelo({ estagio }: EstagioSeloProps) {
  if (!estagio) return null

  if (estagio === 'finalizado') {
    return (
      <span className="ubm-status ubm-status--finalizado">
        <CheckCircle2 size={11} aria-hidden />
        FINALIZADO
      </span>
    )
  }

  return (
    <span className="ubm-status ubm-status--caso">
      <ArrowRight size={11} aria-hidden />
      VIROU CASO
    </span>
  )
}
