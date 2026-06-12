// Lista fechada de cursos da UBM (spec §9 / RN4). Valores espelham o enum `curso_ubm` (architecture §11).
export const CURSOS_UBM = [
  { value: 'administracao', label: 'Administração' },
  { value: 'biomedicina', label: 'Biomedicina' },
  { value: 'ciencias_contabeis', label: 'Ciências Contábeis' },
  { value: 'direito', label: 'Direito' },
  { value: 'educacao_fisica', label: 'Educação Física' },
  { value: 'enfermagem', label: 'Enfermagem' },
  { value: 'engenharia_civil', label: 'Engenharia Civil' },
  { value: 'engenharia_de_software', label: 'Engenharia de Software' },
  { value: 'engenharia_eletrica', label: 'Engenharia Elétrica' },
  { value: 'engenharia_mecanica', label: 'Engenharia Mecânica' },
  { value: 'farmacia', label: 'Farmácia' },
  { value: 'fisioterapia', label: 'Fisioterapia' },
  { value: 'medicina_veterinaria', label: 'Medicina Veterinária' },
  { value: 'musica', label: 'Música' },
  { value: 'nutricao', label: 'Nutrição' },
  { value: 'psicologia', label: 'Psicologia' },
  { value: 'terapia_ocupacional', label: 'Terapia Ocupacional' },
  { value: 'nao_sei', label: 'Não sei / me ajudem a identificar' },
] as const

export type CursoUbm = (typeof CURSOS_UBM)[number]['value']

export const CURSO_VALUES = CURSOS_UBM.map((c) => c.value) as CursoUbm[]

/** Allowlist (RS5): true se `x` pertence à lista fechada. */
export function isCursoValido(x: string): x is CursoUbm {
  return (CURSO_VALUES as string[]).includes(x)
}
