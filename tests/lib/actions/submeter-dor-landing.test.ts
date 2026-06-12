/**
 * T-O3.1 — Server Action: submeterDorLanding
 * TDD RED: testa a action antes de ela chamar as RPCs reais.
 * Mocks: supabase/server + rpc.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- vi.hoisted garante que as vars estão disponíveis quando vi.mock é içado ---
const { mockGetUser, mockRpc, mockFrom, mockInsert } = vi.hoisted(() => {
  const mockInsert = vi.fn()
  const mockFrom = vi.fn(() => ({ insert: mockInsert }))
  const mockGetUser = vi.fn()
  const mockRpc = vi.fn()
  return { mockGetUser, mockRpc, mockFrom, mockInsert }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
    from: mockFrom,
  }),
}))

import { submeterDorLanding, moderarDor, submeterDor } from '@/lib/actions/dor'

const INPUT_BASE = {
  empresaId: 'emp-123',
  descricao: 'Precisamos de ajuda com automação de processos',
  repNome: 'João Silva',
  consentimento: true,
  consentVersion: '1.0',
  consentAt: '2026-06-07T00:00:00Z',
}

describe('submeterDorLanding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'joao@empresa.com' } },
      error: null,
    })
    mockRpc.mockResolvedValue({ data: { dor_id: 'dor-abc' }, error: null })
    mockInsert.mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert: mockInsert })
  })

  it('retorna ok:true com dorId quando RPCs têm sucesso', async () => {
    const result = await submeterDorLanding(INPUT_BASE)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.dorId).toBe('dor-abc')
  })

  it('chama submeter_dor_landing com os parâmetros corretos', async () => {
    await submeterDorLanding(INPUT_BASE)
    expect(mockRpc).toHaveBeenCalledWith('submeter_dor_landing', {
      p_empresa_id: 'emp-123',
      p_descricao: INPUT_BASE.descricao,
      p_rep_nome: 'João Silva',
      p_departamento: null,
      p_cargo: null,
      p_consentimento: true,
      p_consent_version: '1.0',
      p_consent_at: '2026-06-07T00:00:00Z',
      p_cursos: null, // I3: sem cursos → null (RPC usa o default)
    })
  })

  it('retorna ok:false quando usuário não está autenticado', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'not authenticated' },
    })
    const result = await submeterDorLanding(INPUT_BASE)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/sessão|login/i)
  })

  it('retorna ok:false quando RPC retorna erro de empresa', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'empresa obrigatorio' } })
    const result = await submeterDorLanding(INPUT_BASE)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/empresa/i)
  })

  it('retorna ok:false quando RPC retorna erro de consentimento', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'consent missing' } })
    const result = await submeterDorLanding(INPUT_BASE)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/consentimento/i)
  })

  it('passa cursos via p_cursos na RPC, sem loop client-side (FIX I3)', async () => {
    await submeterDorLanding({ ...INPUT_BASE, cursos: ['engenharia_de_software', 'administracao'] })
    // I3: cursos são inseridos DENTRO da RPC (SECURITY DEFINER bypassa a policy
    //     dor_curso_insert_autor que exige esta_verificado()). O antigo loop client-side
    //     `supabase.from('dor_curso').insert(...)` falhava por RLS silenciosamente — foi removido.
    expect(mockRpc).toHaveBeenCalledWith(
      'submeter_dor_landing',
      expect.objectContaining({ p_cursos: ['engenharia_de_software', 'administracao'] }),
    )
    // não há mais escrita client-side em dor_curso
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockFrom).not.toHaveBeenCalledWith('dor_curso')
  })

  it('não falha quando cursos é vazio', async () => {
    const result = await submeterDorLanding({ ...INPUT_BASE, cursos: [] })
    expect(result.ok).toBe(true)
  })

  it('mapeia erro de e-mail não-corporativo (I4) para PT-BR amigável', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'representante exige e-mail corporativo (RN23/CA23)' },
    })
    const result = await submeterDorLanding(INPUT_BASE)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/corporativo/i)
  })
})

describe('moderarDor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('retorna ok:true ao aprovar', async () => {
    const result = await moderarDor('dor-1', 'aprovar')
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('moderar_dor', {
      p_dor_id: 'dor-1',
      p_acao: 'aprovar',
      p_motivo: null,
    })
  })

  it('retorna ok:true ao rejeitar com motivo', async () => {
    const result = await moderarDor('dor-1', 'rejeitar', 'Dor mal formulada')
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('moderar_dor', {
      p_dor_id: 'dor-1',
      p_acao: 'rejeitar',
      p_motivo: 'Dor mal formulada',
    })
  })

  it('retorna ok:false quando RPC retorna erro de permissão', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    const result = await moderarDor('dor-1', 'aprovar')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/permissão/i)
  })
})

describe('submeterDor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('retorna ok:true ao reenviar dor para moderação', async () => {
    const result = await submeterDor('dor-1')
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('submeter_dor', { p_dor_id: 'dor-1' })
  })

  it('retorna ok:false em erro de RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'transição inválida' } })
    const result = await submeterDor('dor-1')
    expect(result.ok).toBe(false)
  })
})
