'use client'
import { CURSOS_UBM, type CursoUbm } from '@/lib/courses'

interface CourseMultiSelectProps {
  value: CursoUbm[]
  onChange: (value: CursoUbm[]) => void
}

// RN4/AC2 — seleção múltipla da lista fechada + "Não sei".
export function CourseMultiSelect({ value, onChange }: CourseMultiSelectProps) {
  const toggle = (curso: CursoUbm) => {
    onChange(value.includes(curso) ? value.filter((c) => c !== curso) : [...value, curso])
  }

  return (
    <fieldset className="ubm-courses">
      <legend>Cursos que podem ajudar</legend>
      {CURSOS_UBM.map((curso) => (
        <label key={curso.value} className="ubm-course-option">
          <input
            type="checkbox"
            checked={value.includes(curso.value)}
            onChange={() => toggle(curso.value)}
          />{' '}
          {curso.label}
        </label>
      ))}
    </fieldset>
  )
}
