/**
 * T-O-A1 — Server Action: uploadAnexo / removerAnexo
 * TDD RED: garante que uploadAnexo inclui enviado_por = user.id no INSERT
 * e que sem sessão retorna erro PT-BR (sem tentar inserir).
 * Bug A / Onda 1: fix NOT NULL + RLS with_check (enviado_por = auth.uid()).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- vi.hoisted: vars disponíveis antes do içamento do vi.mock ---
const { mockGetUser, mockFrom, mockInsert, mockSelect, mockSingle, mockUpdate, mockEq, mockRevalidatePath } =
  vi.hoisted(() => {
    const mockSingle  = vi.fn()
    const mockSelect  = vi.fn(() => ({ single: mockSingle }))
    const mockInsert  = vi.fn(() => ({ select: mockSelect }))
    const mockEq      = vi.fn()
    const mockUpdate  = vi.fn(() => ({ eq: mockEq }))
    const mockFrom    = vi.fn(() => ({ insert: mockInsert, update: mockUpdate }))
    const mockGetUser = vi.fn()
    const mockRevalidatePath = vi.fn()
    return { mockGetUser, mockFrom, mockInsert, mockSelect, mockSingle, mockUpdate, mockEq, mockRevalidatePath }
  })

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

import { uploadAnexo, removerAnexo } from '@/lib/actions/anexo'

const META = {
  nome_original: 'foto.png',
  mime_type: 'image/png',
  tamanho_bytes: 1024,
}

describe('uploadAnexo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSingle.mockResolvedValue({
      data: { id: 'anexo-1', nome_original: 'foto.png', mime_type: 'image/png', tamanho_bytes: 1024 },
      error: null,
    })
  })

  it('A1: retorna ok:true com anexo quando há sessão e INSERT tem sucesso', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-abc' } }, error: null })
    const result = await uploadAnexo('dor-1', 'dor/dor-1/foto.png', META)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.anexo.id).toBe('anexo-1')
    }
  })

  it('A2: inclui enviado_por = user.id no insert (fix NOT NULL + RLS with_check)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-xyz' } }, error: null })
    await uploadAnexo('dor-2', 'dor/dor-2/foto.png', META)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ enviado_por: 'uid-xyz' })
    )
  })

  it('A3: sem sessão (user=null) retorna ok:false com mensagem "Sessão necessária."', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await uploadAnexo('dor-3', 'dor/dor-3/foto.png', META)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/Sessão necessária/i)
    }
    // INSERT não deve ter sido chamado
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('A4: sem sessão (getUser retorna error) retorna ok:false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'not authenticated' } })
    const result = await uploadAnexo('dor-4', 'dor/dor-4/foto.png', META)
    expect(result.ok).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('A5: erro de INSERT é mapeado para mensagem PT-BR', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-abc' } }, error: null })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'quantidade max 5' } })
    const result = await uploadAnexo('dor-5', 'dor/dor-5/foto.png', META)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/5 arquivos/i)
    }
  })

  it('A6: inclui dor_id e storage_path no insert', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-abc' } }, error: null })
    await uploadAnexo('dor-6', 'dor/dor-6/foto.png', META)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        dor_id: 'dor-6',
        storage_path: 'dor/dor-6/foto.png',
      })
    )
  })

  it('A7: chama revalidatePath com dorId e layout após sucesso', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-abc' } }, error: null })
    await uploadAnexo('dor-7', 'dor/dor-7/foto.png', META)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores/dor-7')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores', 'layout')
  })

  it('A8: NÃO chama revalidatePath quando sem sessão', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    await uploadAnexo('dor-8', 'dor/dor-8/foto.png', META)
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

describe('removerAnexo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockResolvedValue({ error: null })
  })

  it('R1: retorna ok:true quando soft-delete tem sucesso', async () => {
    const result = await removerAnexo('anexo-uuid-1')
    expect(result.ok).toBe(true)
  })

  it('R2: chama .from("anexo_dor").update({ deleted_at }).eq("id", anexoId)', async () => {
    await removerAnexo('anexo-uuid-2')
    expect(mockFrom).toHaveBeenCalledWith('anexo_dor')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
    expect(mockEq).toHaveBeenCalledWith('id', 'anexo-uuid-2')
  })

  it('R3: retorna ok:false com mensagem PT-BR quando update falha', async () => {
    mockEq.mockResolvedValue({ error: { message: 'permissao negada' } })
    const result = await removerAnexo('anexo-uuid-3')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/remo|Você não tem permissão/i)
    }
  })

  it('R4: chama revalidatePath com layout após sucesso', async () => {
    await removerAnexo('anexo-uuid-4')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dores', 'layout')
  })

  it('R5: NÃO chama revalidatePath quando update falha', async () => {
    mockEq.mockResolvedValue({ error: { message: 'permissao negada' } })
    await removerAnexo('anexo-uuid-5')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
