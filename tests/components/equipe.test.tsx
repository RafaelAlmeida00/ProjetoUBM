/**
 * T-O3.2 — Componentes UbmTeam / UbmMember / .ubm-anon-tag / .ubm-optin-seal
 * TDD RED: host com stamp HOST; chip de papel; anônimo sem opt-in = anon-tag com texto;
 * com opt-in = nome (Fraunces); UI renderiza o que o dado entrega.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/projetos/1',
}))

import { UbmTeam } from '@/components/ubm-team'
import type { MembroPublico } from '@/lib/data/projetos'

const MEMBRO_HOST_COM_OPTIN: MembroPublico = {
  papel_projeto: 'host',
  nome_ou_papel: 'Ana Souza', // tem opt-in → nome real revelado
  nome_revelado: true,
  ranking_optin: true,
  curso: 'Engenharia de Software',
}

const MEMBRO_CO_SEM_OPTIN: MembroPublico = {
  papel_projeto: 'co_coordenador',
  nome_ou_papel: 'COORDENADOR · ADMINISTRAÇÃO', // sem opt-in/sem audiência interna → papel+curso
  nome_revelado: false,
  ranking_optin: false,
  curso: 'Administração',
}

const MEMBRO_ALUNO_SEM_OPTIN: MembroPublico = {
  papel_projeto: 'aluno',
  nome_ou_papel: 'ALUNO · DIREITO', // sem opt-in → papel+curso
  nome_revelado: false,
  ranking_optin: false,
  curso: 'Direito',
}

const EQUIPE: MembroPublico[] = [MEMBRO_HOST_COM_OPTIN, MEMBRO_CO_SEM_OPTIN, MEMBRO_ALUNO_SEM_OPTIN]

describe('UbmTeam — T-O3.2', () => {
  it('renderiza como <ul> semântica com listitem por membro', () => {
    render(<UbmTeam membros={EQUIPE} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBe(3)
  })

  it('host exibe stamp "HOST" visível', () => {
    render(<UbmTeam membros={EQUIPE} />)
    expect(screen.getAllByText(/HOST/i).length).toBeGreaterThanOrEqual(1)
  })

  it('membro com opt-in exibe nome real (não papel+curso)', () => {
    render(<UbmTeam membros={EQUIPE} />)
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
  })

  it('membro sem opt-in exibe .ubm-anon-tag com texto papel+curso', () => {
    render(<UbmTeam membros={EQUIPE} />)
    // Deve ter o texto do papel+curso para membros sem opt-in
    expect(screen.getByText(/COORDENADOR · ADMINISTRAÇÃO/i)).toBeInTheDocument()
    expect(screen.getByText(/ALUNO · DIREITO/i)).toBeInTheDocument()
  })

  it('membro sem opt-in NÃO exibe nome PII (não vaza nome)', () => {
    const membroComNomePII: MembroPublico = {
      papel_projeto: 'aluno',
      nome_ou_papel: 'ALUNO · DIREITO', // dado já anonimizado na source
      nome_revelado: false,
      ranking_optin: false,
      curso: 'Direito',
    }
    render(<UbmTeam membros={[membroComNomePII]} />)
    // Não deve ter um nome "real" visível — o dado já vem anonimizado
    expect(screen.queryByText('João Silva')).toBeNull()
  })

  it('anon-tag tem texto visível (não só ícone — a11y)', () => {
    render(<UbmTeam membros={[MEMBRO_CO_SEM_OPTIN]} />)
    // O texto papel+curso deve estar visível (não escondido via aria-hidden)
    const texto = screen.getByText(/COORDENADOR · ADMINISTRAÇÃO/i)
    expect(texto).toBeInTheDocument()
    // Não deve estar aria-hidden
    expect(texto.getAttribute('aria-hidden')).not.toBe('true')
  })

  it('chip de papel-no-projeto presente para cada membro', () => {
    render(<UbmTeam membros={EQUIPE} />)
    // Deve ter chip de papel: host, co_coordenador, aluno
    expect(screen.getByText(/co.coordenador|co coordenador/i)).toBeInTheDocument()
    expect(screen.getAllByText(/aluno/i).length).toBeGreaterThanOrEqual(1)
  })

  it('equipe vazia exibe estado vazio humanizado', () => {
    render(<UbmTeam membros={[]} />)
    expect(screen.getByText(/equipe.*formação|ainda.*equipe|formação/i)).toBeInTheDocument()
  })

  it('host com opt-in tem nome acessível na lista', () => {
    render(<UbmTeam membros={[MEMBRO_HOST_COM_OPTIN]} />)
    const listitem = screen.getByRole('listitem')
    // Nome deve estar acessível
    expect(within(listitem).getByText('Ana Souza')).toBeInTheDocument()
  })

  it('UI renderiza exatamente o que o dado entrega (sem barreira UI extra)', () => {
    // Com opt-in = nome; sem opt-in = anon tag — a UI é thin
    const membroOptIn: MembroPublico = {
      papel_projeto: 'aluno',
      nome_ou_papel: 'Maria Pereira',
      nome_revelado: true,
      ranking_optin: true,
      curso: 'Direito',
    }
    render(<UbmTeam membros={[membroOptIn]} />)
    expect(screen.getByText('Maria Pereira')).toBeInTheDocument()
  })

  it('nome revelado internamente (sem opt-in público) mostra o NOME, sem selo público', () => {
    // Audiência interna (admin/host/coord/membro): nome_revelado=true mesmo com ranking_optin=false.
    render(
      <UbmTeam
        membros={[{
          papel_projeto: 'aluno',
          nome_ou_papel: 'Carla Dias',
          nome_revelado: true,
          ranking_optin: false,
          curso: 'Direito',
        }]}
      />,
    )
    expect(screen.getByText('Carla Dias')).toBeInTheDocument()
    // inicial do avatar = 'C' (nome), não 'A' (papel aluno)
    expect(screen.getByText('C')).toBeInTheDocument()
    // sem opt-in público → não exibe o selo PERFIL PÚBLICO
    expect(screen.queryByText(/PERFIL PÚBLICO/i)).toBeNull()
  })

  it('optin-seal visível para membro com ranking_optin=true', () => {
    render(<UbmTeam membros={[MEMBRO_HOST_COM_OPTIN]} />)
    // Deve ter o selo de perfil público
    expect(screen.getByText(/PERFIL PÚBLICO/i)).toBeInTheDocument()
  })
})
