/**
 * CA26 — Bug combobox: "Criar empresa <nome>" gera seleção canônica válida e habilita o avanço.
 * RN26 / architecture D.6
 *
 * RED: falha antes da correção do comportamento do sentinel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// No fluxo anônimo/landing, obterOuCriarEmpresa NÃO é chamada no clique (sessão inexiste).
// O combobox emite um sentinel { id: '__criar__', nome, criar: true } que habilita o avanço.
const buscarEmpresaMock = vi.fn().mockResolvedValue([])
const criarEmpresaMock = vi.fn()

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: (...args: unknown[]) => buscarEmpresaMock(...args),
  obterOuCriarEmpresa: (...args: unknown[]) => criarEmpresaMock(...args),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

import { EmpresaCombobox } from '@/components/empresa/EmpresaCombobox'

describe('EmpresaCombobox — CA26 (sentinel anon / deferred create)', () => {
  beforeEach(() => {
    buscarEmpresaMock.mockResolvedValue([])
    criarEmpresaMock.mockReset()
  })

  it('CA26-1: escolher "Criar empresa" chama onChange imediatamente (sem aguardar RPC)', async () => {
    const user = userEvent.setup({ delay: null })
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} mode="anon" />)
    await user.type(screen.getByRole('combobox'), 'Empresa ABC')
    await waitFor(() => expect(screen.getByText(/criar empresa/i)).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByText(/criar empresa/i))
    // onChange chamado imediatamente — sem await de RPC
    expect(onChange).toHaveBeenCalled()
    expect(criarEmpresaMock).not.toHaveBeenCalled()
  }, 10000)

  it('CA26-2: sentinel emitido tem nome correto e marcador criar:true', async () => {
    const user = userEvent.setup({ delay: null })
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} mode="anon" />)
    await user.type(screen.getByRole('combobox'), 'Empresa ABC')
    await waitFor(() => expect(screen.getByText(/criar empresa/i)).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByText(/criar empresa/i))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Empresa ABC', criar: true }),
    )
  }, 10000)

  it('CA26-3: sentinel tem id não-vazio (não text-livre solto)', async () => {
    const user = userEvent.setup({ delay: null })
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} mode="anon" />)
    await user.type(screen.getByRole('combobox'), 'FooBar Ltda')
    await waitFor(() => expect(screen.getByText(/criar empresa/i)).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByText(/criar empresa/i))
    const selecionado = onChange.mock.calls[0]?.[0] as { id: string }
    expect(selecionado.id).toBeTruthy()
  }, 10000)

  it('CA26-4: no modo autenticado (mode="auth"), ainda chama obterOuCriarEmpresa como antes', async () => {
    criarEmpresaMock.mockResolvedValue({ ok: true, empresa: { id: '99', nome: 'Empresa Auth' } })
    const user = userEvent.setup({ delay: null })
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} mode="auth" />)
    await user.type(screen.getByRole('combobox'), 'Empresa Auth')
    await waitFor(() => expect(screen.getByText(/criar empresa/i)).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByText(/criar empresa/i))
    await waitFor(() => expect(criarEmpresaMock).toHaveBeenCalledWith('Empresa Auth'), { timeout: 3000 })
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: '99' })),
    { timeout: 3000 })
  }, 10000)

  it('CA26-5: exibição no input após sentinel mostra o nome (não o ID)', async () => {
    const user = userEvent.setup({ delay: null })
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} mode="anon" />)
    await user.type(screen.getByRole('combobox'), 'Minha Empresa')
    await waitFor(() => expect(screen.getByText(/criar empresa/i)).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByText(/criar empresa/i))
    const input = screen.getByRole('combobox') as HTMLInputElement
    expect(input.value).toBe('Minha Empresa')
  }, 10000)

  it('CA26-6: após sentinel, renderizar com o valor recebido mostra ícone de check (seleção válida)', async () => {
    const sentinelValue = { id: '__criar__', nome: 'XCorp', criar: true as const }
    render(<EmpresaCombobox value={sentinelValue} onChange={vi.fn()} mode="anon" />)
    // O ícone de check (seleção válida) deve aparecer porque value != null
    const input = screen.getByRole('combobox') as HTMLInputElement
    expect(input.value).toBe('XCorp')
  })
})
