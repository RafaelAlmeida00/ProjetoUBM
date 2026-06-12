import { type CursoUbm, isCursoValido } from './courses'

/** Entrada do wizard/Server Action — SEM id/email/created_at (vêm do servidor; RN2/AC5). */
export interface NewProposal {
  repNome: string
  empresa: string
  departamento?: string
  cargo?: string
  dor: string
  cursos: CursoUbm[]
  consent: boolean
  consentVersion: string
}

/** Usuário autenticado (e-mail = fonte do representante — RN2/AC5). */
export interface AuthUser {
  id: string
  email: string
}

/** Linha persistida (architecture §11). */
export interface SavedProposal extends NewProposal {
  id: string
  userId: string
  email: string
  consentAt: string // ISO8601
  createdAt: string // ISO8601
}

export const LIMITS = {
  repNome: 120,
  empresa: 160,
  departamento: 120,
  cargo: 120,
  dor: 4000,
} as const

export interface ValidationError {
  field: string
  message: string
}

function isFilled(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/** Validação de domínio (RN3/RN4/RS5). Não valida consentimento (ver machine.canSubmit / Server Action). */
export function validateNewProposal(input: NewProposal): ValidationError[] {
  const errs: ValidationError[] = []

  const required = (field: keyof NewProposal, max: number) => {
    const v = input[field]
    if (!isFilled(v)) errs.push({ field, message: 'obrigatório' })
    else if (v.trim().length > max) errs.push({ field, message: `máximo de ${max} caracteres` })
  }
  required('repNome', LIMITS.repNome)
  required('empresa', LIMITS.empresa)
  required('dor', LIMITS.dor)

  if (input.departamento && input.departamento.length > LIMITS.departamento)
    errs.push({ field: 'departamento', message: `máximo de ${LIMITS.departamento} caracteres` })
  if (input.cargo && input.cargo.length > LIMITS.cargo)
    errs.push({ field: 'cargo', message: `máximo de ${LIMITS.cargo} caracteres` })

  if (!Array.isArray(input.cursos) || input.cursos.length === 0)
    errs.push({ field: 'cursos', message: 'selecione ao menos um curso (ou "Não sei")' })
  else if (!input.cursos.every((c) => isCursoValido(c)))
    errs.push({ field: 'cursos', message: 'curso fora da lista permitida' })

  return errs
}
