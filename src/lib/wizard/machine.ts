import { STEPS, type WizardField } from './steps.config'
import { LIMITS, validateNewProposal, type NewProposal } from '../proposal'
import { isCursoValido } from '../courses'

export { STEPS }

export interface WizardState {
  stepIndex: number
  data: Partial<NewProposal>
}

export function initialState(data: Partial<NewProposal> = {}): WizardState {
  return { stepIndex: 0, data }
}

function filledMax(v: unknown, max: number): boolean {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max
}

/** Valida o campo do passo atual (AC1: não avança sem o obrigatório). */
function fieldOk(field: WizardField, data: Partial<NewProposal>): boolean {
  switch (field) {
    case 'repNome':
      return filledMax(data.repNome, LIMITS.repNome)
    case 'empresa':
      return filledMax(data.empresa, LIMITS.empresa)
    case 'departamento':
      return !data.departamento || data.departamento.length <= LIMITS.departamento
    case 'cargo':
      return !data.cargo || data.cargo.length <= LIMITS.cargo
    case 'dor':
      return filledMax(data.dor, LIMITS.dor)
    case 'cursos':
      return Array.isArray(data.cursos) && data.cursos.length > 0 && data.cursos.every(isCursoValido)
    case 'consent':
      return data.consent === true
  }
}

export function canAdvance(s: WizardState): boolean {
  return fieldOk(STEPS[s.stepIndex].field, s.data)
}

export function next(s: WizardState): WizardState {
  return { ...s, stepIndex: Math.min(s.stepIndex + 1, STEPS.length - 1) }
}

export function prev(s: WizardState): WizardState {
  return { ...s, stepIndex: Math.max(s.stepIndex - 1, 0) }
}

/** Progresso disfarçado 0..1 (AC1). */
export function progress(s: WizardState): number {
  return STEPS.length <= 1 ? 1 : s.stepIndex / (STEPS.length - 1)
}

/** Só permite enviar com obrigatórios válidos + consentimento (AC8). */
export function canSubmit(data: Partial<NewProposal>): boolean {
  return validateNewProposal(data as NewProposal).length === 0 && data.consent === true
}
