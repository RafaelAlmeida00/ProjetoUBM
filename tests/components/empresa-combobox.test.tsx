/**
 * T-O2.5 — T5 EmpresaCombobox busca/seleção controlada (cria se não existir)
 * RED: falha antes do componente existir.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const buscarEmpresaMock = vi.fn().mockResolvedValue([
  { id: '1', nome: 'Nissan do Brasil', n_dores: 3 },
  { id: '2', nome: 'Toyota Brasil', n_dores: 1 },
])
const criarEmpresaMock = vi.fn().mockResolvedValue({ ok: true, empresa: { id: '3', nome: 'Empresa Nova' } })

vi.mock('@/lib/actions/empresa', () => ({
  buscarEmpresa: (...args: unknown[]) => buscarEmpresaMock(...args),
  obterOuCriarEmpresa: (...args: unknown[]) => criarEmpresaMock(...args),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn().mockReturnValue({ getAll: () => [], setAll: () => {} }) }))

import { EmpresaCombobox } from '@/components/empresa/EmpresaCombobox'

describe('EmpresaCombobox — T5', () => {
  it('renderiza input com placeholder de busca', () => {
    render(<EmpresaCombobox value={null} onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText(/busque o nome/i)).toBeInTheDocument()
  })

  it('ao digitar, chama buscarEmpresa e mostra resultados', async () => {
    const user = userEvent.setup()
    render(<EmpresaCombobox value={null} onChange={vi.fn()} />)
    const input = screen.getByRole('combobox')
    await user.type(input, 'Nissan')
    await waitFor(() => expect(buscarEmpresaMock).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByText('Nissan do Brasil')).toBeInTheDocument(),
    )
  })

  it('selecionar uma empresa chama onChange com o id', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} />)
    const input = screen.getByRole('combobox')
    await user.type(input, 'Nissan')
    await waitFor(() => expect(screen.getByText('Nissan do Brasil')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Nissan do Brasil'))
    expect(onChange).toHaveBeenCalledWith({ id: '1', nome: 'Nissan do Brasil', n_dores: 3 })
  })

  it('sem resultado exibe opção "+ Criar empresa"', async () => {
    buscarEmpresaMock.mockResolvedValueOnce([])
    const user = userEvent.setup()
    render(<EmpresaCombobox value={null} onChange={vi.fn()} />)
    await user.type(screen.getByRole('combobox'), 'Empresa XYZ')
    await waitFor(() =>
      expect(screen.getByText(/criar empresa/i)).toBeInTheDocument(),
    )
  })

  it('"+ Criar empresa" chama obterOuCriarEmpresa e seleciona', async () => {
    buscarEmpresaMock.mockResolvedValueOnce([])
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<EmpresaCombobox value={null} onChange={onChange} />)
    await user.type(screen.getByRole('combobox'), 'Empresa Nova')
    await waitFor(() => expect(screen.getByText(/criar empresa/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/criar empresa/i))
    await waitFor(() => expect(criarEmpresaMock).toHaveBeenCalledWith('Empresa Nova'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ id: '3', nome: 'Empresa Nova' }))
  })

  it('combobox tem role="combobox", aria-expanded e aria-controls (WAI-ARIA)', async () => {
    const user = userEvent.setup()
    render(<EmpresaCombobox value={null} onChange={vi.fn()} />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await user.type(input, 'Nis')
    await waitFor(() =>
      expect(screen.getByRole('listbox')).toBeInTheDocument(),
    )
  })

  it('ESC fecha o popover', async () => {
    const user = userEvent.setup()
    render(<EmpresaCombobox value={null} onChange={vi.fn()} />)
    const input = screen.getByRole('combobox')
    await user.type(input, 'Nissan')
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
