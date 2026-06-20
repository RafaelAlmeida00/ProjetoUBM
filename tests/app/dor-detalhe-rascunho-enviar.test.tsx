/**
 * Fix-fluxo — DorDetalhe: rascunho do autor PODE ser enviado à moderação.
 * Antes, "submeterDor" só estava ligado ao bloco "Corrigir e reenviar" (status=rejeitada),
 * então um rascunho era beco sem saída (nunca chegava ao admin). Este teste fixa o caminho:
 * autor de rascunho vê "Enviar para moderação" → submeterDor(dorId) → confirmação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const { submeterDorMock } = vi.hoisted(() => ({
  submeterDorMock: vi.fn(),
}))

vi.mock('@/lib/actions/dor', () => ({
  submeterDor: (...args: unknown[]) => submeterDorMock(...args),
  editarDor: vi.fn().mockResolvedValue({ ok: true }),
  moderarDor: vi.fn(),
  criarDor: vi.fn(),
}))

vi.mock('@/lib/actions/anexo', () => ({
  removerAnexo: vi.fn().mockResolvedValue({ ok: true }),
  uploadAnexo: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
  }),
}))

import { DorDetalhe } from '@/components/dores/DorDetalhe'
import type { DorData } from '@/components/dores/DorDetalhe'

const DOR_RASCUNHO: DorData = {
  id: 'dor-rascunho',
  empresa_nome: 'Acme S.A.',
  descricao: 'Precisamos de automação para reduzir erros no processo industrial.',
  status: 'rascunho',
  cursos: [],
  publicada_em: null,
  criada_em: '2026-06-01T00:00:00Z',
  aprovado_por: null,
  motivo_rejeicao: null,
  autor_id: 'user-autor',
}

beforeEach(() => {
  submeterDorMock.mockReset()
  submeterDorMock.mockResolvedValue({ ok: true })
})

describe('DorDetalhe — enviar rascunho à moderação (fix-fluxo)', () => {
  it('autor de rascunho vê o botão "Enviar para moderação"', () => {
    render(
      <DorDetalhe dor={DOR_RASCUNHO} currentUserId="user-autor" isAdmin={false} isAutorEditavel timelineDor={[]} />,
    )
    expect(screen.getByRole('button', { name: /enviar para moderação/i })).toBeInTheDocument()
  })

  it('clicar em "Enviar para moderação" chama submeterDor com o id da dor', async () => {
    const user = userEvent.setup()
    render(
      <DorDetalhe dor={DOR_RASCUNHO} currentUserId="user-autor" isAdmin={false} isAutorEditavel timelineDor={[]} />,
    )
    await user.click(screen.getByRole('button', { name: /enviar para moderação/i }))
    await waitFor(() => expect(submeterDorMock).toHaveBeenCalledWith('dor-rascunho'))
  })

  it('exibe confirmação após envio bem-sucedido', async () => {
    const user = userEvent.setup()
    render(
      <DorDetalhe dor={DOR_RASCUNHO} currentUserId="user-autor" isAdmin={false} isAutorEditavel timelineDor={[]} />,
    )
    await user.click(screen.getByRole('button', { name: /enviar para moderação/i }))
    await waitFor(() => expect(screen.getByText(/enviada para moderação/i)).toBeInTheDocument())
  })

  it('exibe erro quando submeterDor falha', async () => {
    submeterDorMock.mockResolvedValue({ ok: false, error: 'conta nao verificada' })
    const user = userEvent.setup()
    render(
      <DorDetalhe dor={DOR_RASCUNHO} currentUserId="user-autor" isAdmin={false} isAutorEditavel timelineDor={[]} />,
    )
    await user.click(screen.getByRole('button', { name: /enviar para moderação/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('dor NÃO-rascunho (em_moderacao) não mostra "Enviar para moderação"', () => {
    render(
      <DorDetalhe
        dor={{ ...DOR_RASCUNHO, status: 'em_moderacao' }}
        currentUserId="user-autor"
        isAdmin={false}
        isAutorEditavel
        timelineDor={[]}
      />,
    )
    expect(screen.queryByRole('button', { name: /enviar para moderação/i })).toBeNull()
  })
})
