/**
 * B-003 task #3 — Fluxo pós-login: CTA "Nova dor" e estado humanizado para sem-papel.
 *
 * CA27/CA28/RN25/RN21 — spec 004 delta.
 *
 * RED: DoresPage precisa de `isAutenticado` prop para distinguir:
 *   - não-logado: vitrine pública, sem CTA de criação
 *   - logado sem papel: estado vazio com CTA "Complete seu cadastro → /app/onboarding"
 *   - logado como representante verificado: CTA "Propor nova dor" → /propor
 *   - logado como representante não-verificado: CTA locked "Verifique sua conta"
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/dores',
}))

import { DoresPage } from '@/components/dores/DoresPage'

describe('DoresPage — estado humanizado para usuário sem papel (task #3)', () => {
  it('usuário autenticado SEM papel vê CTA "Complete seu cadastro" apontando para /app/onboarding', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        isAutenticado={true}
      />,
    )
    // Deve haver ao menos um link para /app/onboarding (pode ser o botão header + inline)
    const links = screen.getAllByRole('link', { name: /complete seu cadastro|completar|onboarding/i })
    expect(links.length).toBeGreaterThanOrEqual(1)
    expect(links[0]).toHaveAttribute('href', '/app/onboarding')
  })

  it('usuário não-autenticado NÃO vê CTA de onboarding (apenas vitrine pública)', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        isAutenticado={false}
      />,
    )
    expect(screen.queryByRole('link', { name: /complete seu cadastro|onboarding/i })).toBeNull()
  })

  it('representante verificado vê CTA "Propor nova dor" (não o onboarding CTA)', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={true}
        isAutenticado={true}
      />,
    )
    expect(screen.getByRole('link', { name: /propor nova dor/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /complete seu cadastro|onboarding/i })).toBeNull()
  })

  it('representante não-verificado vê locked (não o onboarding CTA)', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={false}
        isAutenticado={true}
      />,
    )
    expect(screen.getByText(/verifique sua conta/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /complete seu cadastro|onboarding/i })).toBeNull()
  })

  it('vitrine vazia + autenticado-sem-papel: mensagem humanizada com direção ao onboarding', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
        isAutenticado={true}
      />,
    )
    // Estado vazio com texto humanizado
    expect(screen.getByText(/ainda não há dores publicadas/i)).toBeInTheDocument()
    // Ao menos um CTA de onboarding visível (header + inline no estado vazio)
    const links = screen.getAllByRole('link', { name: /complete seu cadastro|completar|onboarding/i })
    expect(links.length).toBeGreaterThanOrEqual(1)
  })
})

describe('DoresPage — isAutenticado retro-compat (prop opcional, padrão false)', () => {
  it('sem prop isAutenticado, comportamento igual a isAutenticado=false (sem CTA onboarding)', () => {
    // Testa que a prop é opcional e não quebra o código existente
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />,
    )
    expect(screen.queryByRole('link', { name: /complete seu cadastro|onboarding/i })).toBeNull()
  })
})
