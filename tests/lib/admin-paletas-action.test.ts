/**
 * T13 — Tests para lib/actions/admin-paletas.ts
 *
 * Server Actions: salvarPaleta, definirOficialAtiva, ativarPaletaEmpresa,
 *                 excluirPaleta, restaurarPaleta
 *
 * Supabase client mockado — testa a lógica da borda (gate AA, wiring).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks (vi.mock é hoisted: não usar variáveis externas no factory) ─────────
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

vi.mock('@/lib/theming/paleta-core', () => ({
  gerarTriade: vi.fn(),
  validarAA: vi.fn(),
  CONJUNTO_FECHADO: [
    'primary', 'primary-foreground', 'accent', 'accent-foreground',
    'ring', 'secondary', 'secondary-foreground',
  ],
}))

// Importações estáticas APÓS os mocks (vi.mock é hoisted mesmo assim, mas manter a ordem é boa prática)
import {
  salvarPaleta,
  definirOficialAtiva,
  ativarPaletaEmpresa,
  excluirPaleta,
  restaurarPaleta,
} from '@/lib/actions/admin-paletas'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { gerarTriade, validarAA } from '@/lib/theming/paleta-core'

// ─── Tokens de exemplo válidos ─────────────────────────────────────────────────
const TOKENS_LIGHT = {
  primary: '205 68% 33%',
  'primary-foreground': '0 0% 100%',
  accent: '345 62% 30%',
  'accent-foreground': '0 0% 100%',
  ring: '205 68% 33%',
  secondary: '40 18% 88%',
  'secondary-foreground': '215 30% 18%',
}
const TOKENS_DARK = {
  primary: '205 75% 62%',
  'primary-foreground': '216 40% 10%',
  accent: '345 60% 60%',
  'accent-foreground': '216 40% 10%',
  ring: '205 75% 62%',
  secondary: '216 20% 20%',
  'secondary-foreground': '40 24% 92%',
}

// ─── Helpers de mock ──────────────────────────────────────────────────────────
const mockRpc = vi.fn()

function setupSupabaseMock() {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc: mockRpc } as never)
}

describe('T13 — Server Actions admin-paletas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSupabaseMock()
    // gerarTriade retorna tokens válidos por padrão
    vi.mocked(gerarTriade).mockReturnValue({
      tokens_light: TOKENS_LIGHT,
      tokens_dark: TOKENS_DARK,
    })
    // rpc retorna sucesso por padrão
    mockRpc.mockResolvedValue({ data: 'uuid-gerado', error: null })
  })

  // ─── salvarPaleta ────────────────────────────────────────────────────────────
  describe('salvarPaleta', () => {
    it('gate AA aprovado → chama salvar_paleta e retorna sucesso', async () => {
      vi.mocked(validarAA).mockReturnValue({ ok: true, falhas: [] })

      const result = await salvarPaleta({
        escopo: 'oficial',
        empresaId: null,
        nome: 'Azul Teste',
        sementeHsl: '205 68% 33%',
      })

      expect(result.ok).toBe(true)
      expect(mockRpc).toHaveBeenCalledWith('salvar_paleta', expect.objectContaining({
        p_escopo: 'oficial',
        p_nome: 'Azul Teste',
      }))
    })

    it('gate AA REPROVADO → NÃO chama RPC e retorna erro humanizado PT-BR', async () => {
      vi.mocked(validarAA).mockReturnValue({
        ok: false,
        falhas: ['TEXTO SOBRE PRIMÁRIA 3.9:1 < 4.5 (claro)'],
      })

      const result = await salvarPaleta({
        escopo: 'oficial',
        empresaId: null,
        nome: 'Ruim',
        sementeHsl: '50 100% 60%',
      })

      expect(result.ok).toBe(false)
      expect(mockRpc).not.toHaveBeenCalled()
      // mensagem deve ser em PT-BR e humanizada
      expect(result.error).toMatch(/contraste|acessibilidade|AA|reprovad/i)
      // não pode vazar stack trace
      expect(result.error).not.toMatch(/Error:|TypeError:|at\s/)
    })

    it('gate AA reprovado inclui as falhas na mensagem de erro', async () => {
      vi.mocked(validarAA).mockReturnValue({
        ok: false,
        falhas: ['TEXTO SOBRE PRIMÁRIA 3.9:1 < 4.5 (claro)', 'ACENTO SOBRE FUNDO 2.1:1 < 3 (escuro)'],
      })

      const result = await salvarPaleta({
        escopo: 'empresa',
        empresaId: 'empresa-uuid',
        nome: 'Corp Ruim',
        sementeHsl: '50 100% 60%',
      })

      expect(result.ok).toBe(false)
      // as falhas devem aparecer na mensagem
      expect(result.error).toMatch(/3\.9:1|PRIMÁRIA|2\.1:1/i)
    })

    it('nunca usa service_role — createSupabaseServerClient não recebe service_role', async () => {
      vi.mocked(validarAA).mockReturnValue({ ok: true, falhas: [] })

      await salvarPaleta({ escopo: 'oficial', empresaId: null, nome: 'X', sementeHsl: '205 68% 33%' })

      // createSupabaseServerClient é chamada — sem argumentos service_role
      expect(createSupabaseServerClient).toHaveBeenCalled()
      const calls = vi.mocked(createSupabaseServerClient).mock.calls
      calls.forEach((args) => {
        const argsStr = JSON.stringify(args)
        expect(argsStr).not.toMatch(/service_role/)
      })
    })
  })

  // ─── definirOficialAtiva ──────────────────────────────────────────────────────
  describe('definirOficialAtiva', () => {
    it('chama ativar_paleta(p_id) com o id fornecido', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const result = await definirOficialAtiva('paleta-uuid-oficial')
      expect(mockRpc).toHaveBeenCalledWith('ativar_paleta', { p_id: 'paleta-uuid-oficial' })
      expect(result.ok).toBe(true)
    })

    it('propaga erro da RPC como mensagem PT-BR sem stack', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'apenas admin' } })
      const result = await definirOficialAtiva('paleta-uuid')
      expect(result.ok).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.error).not.toMatch(/Error:|at\s/)
    })
  })

  // ─── ativarPaletaEmpresa ──────────────────────────────────────────────────────
  describe('ativarPaletaEmpresa', () => {
    it('chama ativar_paleta(p_id) — MESMA RPC que definirOficialAtiva', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const result = await ativarPaletaEmpresa('paleta-uuid-empresa')
      expect(mockRpc).toHaveBeenCalledWith('ativar_paleta', { p_id: 'paleta-uuid-empresa' })
      expect(result.ok).toBe(true)
    })
  })

  // ─── excluirPaleta ────────────────────────────────────────────────────────────
  describe('excluirPaleta', () => {
    it('chama excluir_paleta(p_id)', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const result = await excluirPaleta('paleta-para-excluir')
      expect(mockRpc).toHaveBeenCalledWith('excluir_paleta', { p_id: 'paleta-para-excluir' })
      expect(result.ok).toBe(true)
    })
  })

  // ─── restaurarPaleta ──────────────────────────────────────────────────────────
  describe('restaurarPaleta', () => {
    it('chama restore_record com tabela "paleta" e o id', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      const result = await restaurarPaleta('paleta-para-restaurar')
      expect(mockRpc).toHaveBeenCalledWith('restore_record', {
        p_tabela: 'paleta',
        p_id: 'paleta-para-restaurar',
      })
      expect(result.ok).toBe(true)
    })
  })
})
