/**
 * Fix /propor — bugs B-003:
 *   (a) buscar_empresa: parâmetro real é `q` (não `p_query`) → HTTP 404 silencioso
 *   (b) obter_ou_criar_empresa: RPC devolve uuid puro; action deve normalizar para { id, nome }
 *   (c) obterOuCriarEmpresa encolhia erro real; deve retornar null com log adequado (erro mapeável pelo caller)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({ rpc: mockRpc }),
}))

import { buscarEmpresa, obterOuCriarEmpresa } from '@/lib/actions/empresa'

// ── buscarEmpresa ────────────────────────────────────────────────────────────

describe('buscarEmpresa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usa o parâmetro { q } correto (não p_query) — evita HTTP 404', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'e1', nome_canonico: 'ACME', sim: 1 }], error: null })
    await buscarEmpresa('ACM')
    // A assinatura real da RPC é buscar_empresa(q text) — não p_query
    expect(mockRpc).toHaveBeenCalledWith('buscar_empresa', { q: 'ACM' })
  })

  it('retorna lista vazia quando a query tem menos de 2 caracteres', async () => {
    const result = await buscarEmpresa('A')
    expect(mockRpc).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('retorna lista vazia em erro da RPC (degradação silenciosa é ok aqui)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'some db error' } })
    expect(await buscarEmpresa('ACME')).toEqual([])
  })

  it('mapeia nome_canonico → nome (contrato EmpresaResult) quando a RPC tem sucesso', async () => {
    // A RPC buscar_empresa retorna { id, nome_canonico, sim } — a action mapeia p/ { id, nome }
    mockRpc.mockResolvedValue({
      data: [
        { id: 'e1', nome_canonico: 'ACME Ltda', sim: 0.9 },
        { id: 'e2', nome_canonico: 'ACME Corp', sim: 0.7 },
      ],
      error: null,
    })
    expect(await buscarEmpresa('ACME')).toEqual([
      { id: 'e1', nome: 'ACME Ltda' },
      { id: 'e2', nome: 'ACME Corp' },
    ])
  })
})

// ── obterOuCriarEmpresa ──────────────────────────────────────────────────────

describe('obterOuCriarEmpresa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normaliza retorno escalar (uuid) da RPC para { ok: true, empresa: { id, nome } }', async () => {
    mockRpc.mockResolvedValue({ data: 'uuid-123', error: null })
    const r = await obterOuCriarEmpresa('  ACME Ltda ')
    expect(mockRpc).toHaveBeenCalledWith('obter_ou_criar_empresa', { p_nome: 'ACME Ltda' })
    expect(r).toEqual({ ok: true, empresa: { id: 'uuid-123', nome: 'ACME Ltda' } })
  })

  it('D5: propaga erro mapeado quando RPC falha — retorna { ok: false, error } em vez de null opaco', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function obter_ou_criar_empresa' },
    })
    const r = await obterOuCriarEmpresa('ACME')
    // Deve retornar result com ok:false e mensagem mapeada (não null opaco)
    expect(r).toMatchObject({ ok: false, error: expect.any(String) })
    expect((r as { ok: false; error: string }).error.length).toBeGreaterThan(0)
  })

  it('D5: retorna { ok: false } quando a RPC não devolve dado', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const r = await obterOuCriarEmpresa('ACME')
    expect(r).toMatchObject({ ok: false })
  })

  it('D5: retorna { ok: true, empresa } no caminho feliz', async () => {
    mockRpc.mockResolvedValue({ data: 'uuid-789', error: null })
    const r = await obterOuCriarEmpresa('Empresa OK')
    expect(r).toMatchObject({ ok: true, empresa: { id: 'uuid-789', nome: 'Empresa OK' } })
  })

  it('faz trim no nome antes de passar para a RPC', async () => {
    mockRpc.mockResolvedValue({ data: 'uuid-456', error: null })
    const r = await obterOuCriarEmpresa('  Empresa com espaços  ')
    expect(mockRpc).toHaveBeenCalledWith('obter_ou_criar_empresa', { p_nome: 'Empresa com espaços' })
    expect(r).toEqual({ ok: true, empresa: { id: 'uuid-456', nome: 'Empresa com espaços' } })
  })
})
