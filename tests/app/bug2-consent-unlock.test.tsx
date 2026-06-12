/**
 * BUG-2 — Consentimento LGPD não desbloqueia o botão Enviar
 * RED: marcar o checkbox deve habilitar o botão Enviar quando empresa e descricao estão válidos.
 * CA3/AC8/RN5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDorLanding: vi.fn().mockResolvedValue({ ok: true, dorId: 'dor-1' }),
  submeterDor: vi.fn(),
  moderarDor: vi.fn(),
}))

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: vi.fn().mockResolvedValue([{ id: '1', nome: 'Empresa Teste' }]),
  obterOuCriarEmpresa: vi.fn().mockResolvedValue({ id: '1', nome: 'Empresa Teste' }),
}))

import { ProporSubmitForm } from '@/components/propor/ProporSubmitForm'

describe('BUG-2 — Consentimento LGPD desbloqueia botão Enviar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ao marcar o checkbox de consentimento, o botão Enviar fica HABILITADO (empresa + descricao válidos)', () => {
    render(
      <ProporSubmitForm
        initialStep="consent"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Descrição válida com mais de 10 chars aqui"
      />,
    )

    // Botão deve estar desabilitado antes de marcar
    const btn = screen.getByRole('button', { name: /enviar/i })
    expect(btn).toBeDisabled()

    // Marcar o checkbox
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    // Botão DEVE estar habilitado após marcar o consent
    expect(btn).not.toBeDisabled()
  })

  it('ao desmarcar o checkbox, o botão Enviar volta a ficar desabilitado', () => {
    render(
      <ProporSubmitForm
        initialStep="consent"
        empresaId="emp-1"
        empresaNome="Empresa Teste"
        descricao="Descrição válida com mais de 10 chars aqui"
        consentido
      />,
    )

    const btn = screen.getByRole('button', { name: /enviar/i })
    // Começa habilitado (consentido=true)
    expect(btn).not.toBeDisabled()

    // Desmarcar
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    // Volta a ficar desabilitado
    expect(btn).toBeDisabled()
  })
})
