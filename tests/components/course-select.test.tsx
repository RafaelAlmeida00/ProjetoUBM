import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CourseMultiSelect } from '@/components/course/CourseMultiSelect'
import { CURSOS_UBM } from '@/lib/courses'

// T2d — RN4/AC2 (multi-seleção da lista fechada + "Não sei")
describe('CourseMultiSelect', () => {
  it('renderiza todos os cursos + "Não sei"', () => {
    render(<CourseMultiSelect value={[]} onChange={() => {}} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(CURSOS_UBM.length)
    expect(screen.getByLabelText('Engenharia de Software')).toBeInTheDocument()
    expect(screen.getByLabelText(/Não sei/i)).toBeInTheDocument()
  })

  it('seleção emite array com valor da allowlist', () => {
    const onChange = vi.fn()
    render(<CourseMultiSelect value={[]} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Engenharia de Software'))
    expect(onChange).toHaveBeenCalledWith(['engenharia_de_software'])
  })
})
