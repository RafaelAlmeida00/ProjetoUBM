import type { NewProposal } from '@/lib/proposal'

/** Proposta válida de referência (case Barra Mansa). */
export const validNewProposal: NewProposal = {
  repNome: 'Maria Souza',
  empresa: 'Prefeitura de Barra Mansa',
  departamento: 'TI',
  cargo: 'Coordenadora de Tecnologia',
  dor: 'Precisamos integrar os serviços ao cidadão em um único aplicativo.',
  cursos: ['engenharia_de_software'],
  consent: true,
  consentVersion: 'v1',
}
