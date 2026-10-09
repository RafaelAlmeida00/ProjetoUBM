/**
 * Regressão — EmpresaCombobox dentro de container com clip-path/overflow (ex.: /admin/usuarios,
 * painel "Gerir" dentro de `.ubm-machined` com overflow-x:auto). O popover absoluto era recortado
 * pelo container: opções e "Criar empresa" ficavam inclicáveis e nenhuma RPC era enviada.
 * Contrato: o popover é renderizado em portal (document.body), fora do container que recorta,
 * e o mousedown no popover não tira o foco do input (evita o onBlur fechar antes do click).
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

import { EmpresaCombobox } from '@/components/empresa/EmpresaCombobox'

function renderNoContainerQueRecorta(onChange = vi.fn()) {
  const utils = render(
    <div data-testid="clip" className="ubm-machined" style={{ overflowX: 'auto' }}>
      <EmpresaCombobox value={null} onChange={onChange} mode="auth" />
    </div>,
  )
  return { ...utils, onChange }
}

describe('EmpresaCombobox — popover em portal (bug admin/usuarios)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buscarEmpresaMock.mockResolvedValue([{ id: '1', nome: 'Nissan do Brasil' }])
    criarEmpresaMock.mockResolvedValue({ ok: true, empresa: { id: '9', nome: 'Empresa Nova' } })
  })

  it('renderiza o listbox fora do container que recorta (portal no body)', async () => {
    const user = userEvent.setup()
    renderNoContainerQueRecorta()
    await user.type(screen.getByRole('combobox'), 'Nissan')
    const listbox = await screen.findByRole('listbox')
    expect(screen.getByTestId('clip').contains(listbox)).toBe(false)
    expect(document.body.contains(listbox)).toBe(true)
  })

  it('mousedown numa opção não rouba o foco do input (preventDefault)', async () => {
    const user = userEvent.setup()
    renderNoContainerQueRecorta()
    await user.type(screen.getByRole('combobox'), 'Nissan')
    const opcao = await screen.findByText('Nissan do Brasil')
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    opcao.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('selecionar opção no portal chama onChange', async () => {
    const user = userEvent.setup()
    const { onChange } = renderNoContainerQueRecorta()
    await user.type(screen.getByRole('combobox'), 'Nissan')
    await user.click(await screen.findByText('Nissan do Brasil'))
    expect(onChange).toHaveBeenCalledWith({ id: '1', nome: 'Nissan do Brasil' })
  })

  it('"Criar empresa" no portal chama obterOuCriarEmpresa e onChange', async () => {
    buscarEmpresaMock.mockResolvedValue([])
    const user = userEvent.setup()
    const { onChange } = renderNoContainerQueRecorta()
    await user.type(screen.getByRole('combobox'), 'Empresa Nova')
    await user.click(await screen.findByRole('button', { name: /criar empresa/i }))
    await waitFor(() => expect(criarEmpresaMock).toHaveBeenCalledWith('Empresa Nova'))
    expect(onChange).toHaveBeenCalledWith({ id: '9', nome: 'Empresa Nova' })
  })

  it('falha ao criar mostra a mensagem de erro (não falha em silêncio)', async () => {
    buscarEmpresaMock.mockResolvedValue([])
    criarEmpresaMock.mockResolvedValue({ ok: false, error: 'Não foi possível registrar a empresa. Tente novamente.' })
    const user = userEvent.setup()
    const { onChange } = renderNoContainerQueRecorta()
    await user.type(screen.getByRole('combobox'), 'Empresa Nova')
    fireEvent.click(await screen.findByRole('button', { name: /criar empresa/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível registrar/i)
    expect(onChange).not.toHaveBeenCalled()
  })
})
