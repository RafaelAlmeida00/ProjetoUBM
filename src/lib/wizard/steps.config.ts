// Definição declarativa dos passos do wizard (1 input por tela — AC1/AC2).
export type WizardField =
  | 'repNome'
  | 'empresa'
  | 'departamento'
  | 'cargo'
  | 'dor'
  | 'cursos'
  | 'consent'

export interface StepDef {
  field: WizardField
  required: boolean
  label: string
  microcopy: string
}

/** Ordem dos passos (AC2). Microcopy conversacional — "não parece um forms" (spec §4). */
export const STEPS: StepDef[] = [
  { field: 'repNome', required: true, label: 'Como podemos te chamar?', microcopy: 'Seu nome, para sabermos quem está propondo a ideia.' },
  { field: 'empresa', required: true, label: 'De qual empresa ou órgão você fala?', microcopy: 'O nome da organização que vive essa dor.' },
  { field: 'departamento', required: false, label: 'Qual área está envolvida? (opcional)', microcopy: 'Se fizer sentido, o departamento relacionado.' },
  { field: 'cargo', required: false, label: 'Qual é o seu cargo? (opcional)', microcopy: 'Ajuda a entender o seu ponto de vista.' },
  { field: 'dor', required: true, label: 'Qual é a dor?', microcopy: 'Conte, com as suas palavras, o problema que você quer resolver.' },
  { field: 'cursos', required: true, label: 'Que área pode ajudar?', microcopy: 'Escolha um ou mais cursos — ou "Não sei", e a gente te orienta.' },
  { field: 'consent', required: true, label: 'Podemos seguir?', microcopy: 'Precisamos do seu consentimento para tratar os dados informados.' },
]
