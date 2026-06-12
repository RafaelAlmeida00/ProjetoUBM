'use client'
import { PencilLine, Hourglass, ClockCheck, Check, CornerUpLeft } from 'lucide-react'

export type StatusDorValue =
  | 'rascunho'
  | 'em_moderacao'
  | 'publicada'
  | 'rejeitada'

interface StatusDorProps {
  status: StatusDorValue
  aprovadoPor?: string | null
  /** Aplica pulso na costura (dor em moderação aguardando) */
  pulso?: boolean
  className?: string
}

/**
 * Etiqueta de status_dor — sempre cor + ícone + rótulo (nunca cor sozinha — a11y).
 * Implementa os tokens semânticos do design §2.3.
 */
export function StatusDor({ status, aprovadoPor, pulso, className }: StatusDorProps) {
  const isAprovadaAguardando = status === 'em_moderacao' && !!aprovadoPor

  let modifier: string
  let rotulo: string
  let Icon: React.ElementType

  if (isAprovadaAguardando) {
    modifier = 'ubm-status--aprovada'
    rotulo = 'Aprovada · Aguarda Verificação'
    Icon = ClockCheck
  } else {
    switch (status) {
      case 'rascunho':
        modifier = 'ubm-status--rascunho'
        rotulo = 'Rascunho'
        Icon = PencilLine
        break
      case 'em_moderacao':
        modifier = 'ubm-status--moderacao'
        rotulo = 'Em Moderação'
        Icon = Hourglass
        break
      case 'publicada':
        modifier = 'ubm-status--publicada'
        rotulo = 'Publicada'
        Icon = Check
        break
      case 'rejeitada':
        modifier = 'ubm-status--rejeitada'
        rotulo = 'Revisar'
        Icon = CornerUpLeft
        break
      default:
        modifier = ''
        rotulo = status
        Icon = PencilLine
    }
  }

  const pulsoClass = pulso && status === 'em_moderacao' ? ' ubm-status--pulso' : ''

  return (
    <span className={`ubm-status ${modifier}${pulsoClass}${className ? ` ${className}` : ''}`}>
      <Icon aria-hidden size={12} />
      {rotulo}
    </span>
  )
}
