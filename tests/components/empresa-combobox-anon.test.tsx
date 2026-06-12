/**
 * T-AN13 — EmpresaCombobox no /propor anônimo:
 *   - usa buscar_empresa (DEFINER já grant anon) para selecionar empresa existente
 *   - "criar" carrega nome no cache (empresa.nome + criar:true) SEM chamar obterOuCriarEmpresa
 *   - nunca texto livre sem seleção (regressão D6)
 * RED: falha antes do comportamento estar correto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const buscarEmpresaMock = vi.fn()
const criarEmpresaMock = vi.fn()

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: (...args: unknown[]) => buscarEmpresaMock(...args),
  obterOuCriarEmpresa: (...args: unknown[]) => criarEmpresaMock(...args),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }),
}))

import { EmpresaCombobox } from '@/components/empresa/EmpresaCombobox'

describe('EmpresaCombobox — T-AN13 (fluxo anônimo /propor)', () => {
  beforeEach(() => {
    buscarEmpresaMock.mockReset()
    criarEmpresaMock.mockReset()
  })

  it('AN13-1: anon seleciona empresa existente → onChange com id real (não chama obterOuCriarEmpresa)', async () => {
    buscarEmpresaMock.mockResolvedValue([
      { id: 'emp-1', nome: 'Acme Ltda', n_dores: 2 },
    ])
    const user = userEvent.setup({ delay: null })
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} mode="anon" />)
    await user.type(screen.getByRole('combobox'), 'Acme')
    await waitFor(() => expect(screen.getByText('Acme Ltda')).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByText('Acme Ltda'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'emp-1', nome: 'Acme Ltda' }),
    )
    expect(criarEmpresaMock).not.toHaveBeenCalled()
  }, 10000)

  it('AN13-2: anon "criar empresa" emite sentinel { nome, criar:true } SEM chamar obterOuCriarEmpresa', async () => {
    buscarEmpresaMock.mockResolvedValue([])
    const user = userEvent.setup({ delay: null })
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} mode="anon" />)
    await user.type(screen.getByRole('combobox'), 'Nova Corp')
    await waitFor(() => expect(screen.getByText(/criar empresa/i)).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByText(/criar empresa/i))
    // obterOuCriarEmpresa NÃO deve ser chamada no fluxo anon (E.3: diferir ao claim)
    expect(criarEmpresaMock).not.toHaveBeenCalled()
    // sentinel emitido com criar:true
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Nova Corp', criar: true }),
    )
  }, 10000)

  it('AN13-3: sentinel tem id não-vazio (não é texto livre solto — D6)', async () => {
    buscarEmpresaMock.mockResolvedValue([])
    const user = userEvent.setup({ delay: null })
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} mode="anon" />)
    await user.type(screen.getByRole('combobox'), 'FooBar Ltda')
    await waitFor(() => expect(screen.getByText(/criar empresa/i)).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByText(/criar empresa/i))
    const emitido = onChange.mock.calls[0]?.[0] as { id: string; criar?: boolean }
    expect(emitido.id).toBeTruthy()
    expect(emitido.criar).toBe(true)
  }, 10000)

  it('AN13-4: no modo auth, obterOuCriarEmpresa AINDA é chamada (regressão CA26-4)', async () => {
    buscarEmpresaMock.mockResolvedValue([])
    criarEmpresaMock.mockResolvedValue({ ok: true, empresa: { id: '99', nome: 'Empresa Auth' } })
    const user = userEvent.setup({ delay: null })
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} mode="auth" />)
    await user.type(screen.getByRole('combobox'), 'Empresa Auth')
    await waitFor(() => expect(screen.getByText(/criar empresa/i)).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByText(/criar empresa/i))
    await waitFor(() => expect(criarEmpresaMock).toHaveBeenCalledWith('Empresa Auth'), { timeout: 3000 })
  }, 10000)

  it('AN13-5: buscar_empresa é chamada ao digitar (não obterOuCriarEmpresa)', async () => {
    buscarEmpresaMock.mockResolvedValue([{ id: 'e1', nome: 'Petrobras' }])
    const user = userEvent.setup({ delay: null })
    render(<EmpresaCombobox value={null} onChange={vi.fn()} mode="anon" />)
    await user.type(screen.getByRole('combobox'), 'Petro')
    await waitFor(() => expect(buscarEmpresaMock).toHaveBeenCalled())
    expect(criarEmpresaMock).not.toHaveBeenCalled()
  }, 10000)
})
