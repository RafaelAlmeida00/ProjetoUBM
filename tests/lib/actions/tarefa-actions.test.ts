/**
 * T-O2.4 — TDD RED: testa as actions criarTarefa / editarTarefa /
 * concluirTarefa / reatribuirTarefa antes de existirem em
 * workspace/src/lib/actions/tarefa.ts
 *
 * DML direto sob RLS (funcao_tarefa). A RLS é a barreira — a action mapeia erros PT-BR.
 * Padrão: vi.mock('@/lib/supabase/server') + mockFrom com cadeia fluente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks da cadeia fluente do Supabase: from().insert().select().single(), from().update().eq()
const { mockInsert, mockSelect, mockSingle, mockUpdate, mockEq, mockFrom, mockRevalidatePath } = vi.hoisted(() => {
  const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'tarefa-nova' }, error: null })
  const mockSelect = vi.fn(() => ({ single: mockSingle }))
  const mockInsert = vi.fn(() => ({ select: mockSelect }))
  const mockEq = vi.fn().mockResolvedValue({ error: null })
  const mockUpdate = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ insert: mockInsert, update: mockUpdate }))
  const mockRevalidatePath = vi.fn()
  return { mockInsert, mockSelect, mockSingle, mockUpdate, mockEq, mockFrom, mockRevalidatePath }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: mockFrom,
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

import {
  criarTarefa,
  editarTarefa,
  concluirTarefa,
  reatribuirTarefa,
} from '@/lib/actions/tarefa'

describe('criarTarefa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // chain: insert() → select() → single()
    mockSingle.mockResolvedValue({ data: { id: 'tarefa-nova' }, error: null })
    mockSelect.mockReturnValue({ single: mockSingle })
    mockInsert.mockReturnValue({ select: mockSelect })
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate })
  })

  it('chama revalidatePath em /app/dores e /app ao ter sucesso', async () => {
    await criarTarefa({ projetoId: 'proj-1', responsavelId: 'user-1', titulo: 'Tarefa X' })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores', 'layout')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app', 'page')
  })

  it('NÃO chama revalidatePath quando inserção falha', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } })
    await criarTarefa({ projetoId: 'proj-1', responsavelId: 'user-1', titulo: 'Tarefa X' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('retorna ok:true com id quando inserção tem sucesso', async () => {
    const result = await criarTarefa({
      projetoId: 'proj-1',
      responsavelId: 'user-1',
      titulo: 'Elaborar relatório',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.tarefaId).toBe('tarefa-nova')
  })

  it('insere na tabela funcao_tarefa', async () => {
    await criarTarefa({
      projetoId: 'proj-1',
      responsavelId: 'user-1',
      titulo: 'Elaborar relatório',
    })
    expect(mockFrom).toHaveBeenCalledWith('funcao_tarefa')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        projeto_id: 'proj-1',
        responsavel_id: 'user-1',
        titulo: 'Elaborar relatório',
      }),
    )
  })

  it('inclui descricao quando fornecida', async () => {
    await criarTarefa({
      projetoId: 'proj-1',
      responsavelId: 'user-1',
      titulo: 'Tarefa X',
      descricao: 'Detalhe da tarefa',
    })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ descricao: 'Detalhe da tarefa' }),
    )
  })

  it('mapeia erro de permissão (não-membro) para PT-BR (CA22)', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for table funcao_tarefa' },
    })
    const result = await criarTarefa({
      projetoId: 'proj-1',
      responsavelId: 'user-1',
      titulo: 'Tarefa X',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão|membro/i)
    }
  })

  it('mapeia erro de titulo vazio para PT-BR', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'check constraint "funcao_tarefa_titulo_check"' },
    })
    const result = await criarTarefa({
      projetoId: 'proj-1',
      responsavelId: 'user-1',
      titulo: '',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/título/i)
    }
  })
})

describe('editarTarefa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate })
  })

  it('retorna ok:true quando update tem sucesso', async () => {
    const result = await editarTarefa({ id: 'tarefa-1', titulo: 'Novo título' })
    expect(result.ok).toBe(true)
  })

  it('atualiza na tabela funcao_tarefa com eq no id', async () => {
    await editarTarefa({ id: 'tarefa-abc', titulo: 'Título atualizado' })
    expect(mockFrom).toHaveBeenCalledWith('funcao_tarefa')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Título atualizado' }),
    )
    expect(mockEq).toHaveBeenCalledWith('id', 'tarefa-abc')
  })

  it('mapeia erro de permissão RLS (aluno editando tarefa de outro) para PT-BR (CA20)', async () => {
    mockEq.mockResolvedValueOnce({
      error: { message: 'permission denied for table funcao_tarefa' },
    })
    const result = await editarTarefa({ id: 'tarefa-1', titulo: 'Hack' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão|responsável|tarefa/i)
    }
  })

  it('aplica somente campos fornecidos (sem sobrescrever com undefined)', async () => {
    await editarTarefa({ id: 'tarefa-1', descricao: 'Nova descrição' })
    const callPayload = mockUpdate.mock.calls[0][0]
    expect(callPayload).not.toHaveProperty('titulo')
    expect(callPayload).toHaveProperty('descricao', 'Nova descrição')
  })
})

describe('concluirTarefa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate })
  })

  it('chama revalidatePath em /app/dores e /app ao ter sucesso', async () => {
    await concluirTarefa('tarefa-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores', 'layout')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app', 'page')
  })

  it('retorna ok:true quando update tem sucesso', async () => {
    const result = await concluirTarefa('tarefa-1')
    expect(result.ok).toBe(true)
  })

  it('seta concluida=true na tabela funcao_tarefa', async () => {
    await concluirTarefa('tarefa-abc')
    expect(mockFrom).toHaveBeenCalledWith('funcao_tarefa')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ concluida: true }),
    )
    expect(mockEq).toHaveBeenCalledWith('id', 'tarefa-abc')
  })

  it('mapeia erro de permissão (não-membro/não-responsável) para PT-BR (CA20)', async () => {
    mockEq.mockResolvedValueOnce({
      error: { message: 'permission denied for table funcao_tarefa' },
    })
    const result = await concluirTarefa('tarefa-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão|responsável|tarefa/i)
    }
  })
})

describe('reatribuirTarefa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate })
  })

  it('retorna ok:true quando update tem sucesso', async () => {
    const result = await reatribuirTarefa('tarefa-1', 'novo-user')
    expect(result.ok).toBe(true)
  })

  it('atualiza responsavel_id na tabela funcao_tarefa (CA21)', async () => {
    await reatribuirTarefa('tarefa-abc', 'user-novo')
    expect(mockFrom).toHaveBeenCalledWith('funcao_tarefa')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ responsavel_id: 'user-novo' }),
    )
    expect(mockEq).toHaveBeenCalledWith('id', 'tarefa-abc')
  })

  it('mapeia erro de permissão (aluno reatribuindo = RLS nega) para PT-BR (CA21)', async () => {
    mockEq.mockResolvedValueOnce({
      error: { message: 'permission denied for table funcao_tarefa' },
    })
    const result = await reatribuirTarefa('tarefa-1', 'outro-user')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/permissão|coordenador|host/i)
    }
  })
})
