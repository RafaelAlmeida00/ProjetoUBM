'use client'
import { AlertCircle } from 'lucide-react'
import { CURSOS_UBM, type CursoUbm } from '@/lib/courses'

interface CourseSingleSelectProps {
  value: CursoUbm | null
  onChange: (value: CursoUbm) => void
  /** Exibe erro de validação abaixo do fieldset */
  error?: string | null
}

// Cursos disponíveis para coordenador — exclui nao_sei (coordenador deve saber o curso)
const CURSOS_COORD = CURSOS_UBM.filter((c) => c.value !== 'nao_sei')

/**
 * Seletor de curso único para coordenador (Onda 2 — A1).
 * Radio inputs, espelha CourseMultiSelect mas em variante single-select.
 * Exclui "nao_sei" — coordenador deve saber qual curso coordena.
 * A11y: fieldset/legend, aria-required, foco visível nativo.
 */
export function CourseSingleSelect({ value, onChange, error }: CourseSingleSelectProps) {
  return (
    <div className="ubm-field">
      <fieldset className="ubm-courses">
        <legend>
          Curso que você coordena <span className="ubm-req">*</span>
        </legend>
        <p id="curso-coord-help" className="ubm-field-help" style={{ marginBottom: '0.5rem' }}>
          Você verá e moderará apenas as indicações deste curso.
        </p>
        {CURSOS_COORD.map((curso) => (
          <label key={curso.value} className="ubm-course-option">
            <input
              type="radio"
              name="curso-coord"
              value={curso.value}
              checked={value === curso.value}
              onChange={() => onChange(curso.value)}
              aria-required="true"
              aria-describedby="curso-coord-help"
            />{' '}
            {curso.label}
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="ubm-field-error">
          <AlertCircle aria-hidden size={14} />
          {error}
        </p>
      )}
    </div>
  )
}
