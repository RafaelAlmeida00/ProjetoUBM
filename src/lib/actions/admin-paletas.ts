'use server'
import { revalidatePath } from 'next/cache'
/**
 * lib/actions/admin-paletas.ts
 *
 * T13 — Server Actions para gestão de paletas (admin).
 * Borda "casca-fina": gate AA antes de gravar, wiring das RPCs.
 *
 * Regras duras:
 * - NUNCA service_role (RS-P12 / ADR-0001)
 * - gate AA antes de gravar (architecture.md §6.1 / RS-P5)
 * - mensagens de erro em PT-BR, sem stack (RS-P7)
 * - MESMA RPC ativar_paleta(p_id) para oficial e empresa (contrato A2)
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { gerarTriade, validarAA } from '@/lib/theming/paleta-core'

// ─── Tipos de retorno ─────────────────────────────────────────────────────────
export interface ActionResult {
  ok: boolean
  error?: string
  data?: unknown
}

export interface SalvarPaletaInput {
  /** id para edição; null para criar */
  id?: string | null
  escopo: 'oficial' | 'empresa'
  empresaId: string | null
  nome: string
  sementeHsl: string
  /** Preservar marsala (default: true) */
  manterMarsala?: boolean
}

// ─── salvarPaleta ─────────────────────────────────────────────────────────────

/**
 * Gera a tríade a partir da semente, roda o gate AA,
 * e só chama salvar_paleta se aprovada.
 *
 * tasks.md T13 / contracts/paleta.md §3 / architecture.md §6.1
 */
export async function salvarPaleta(input: SalvarPaletaInput): Promise<ActionResult> {
  try {
    const { id, escopo, empresaId, nome, sementeHsl, manterMarsala = true } = input

    // 1. Gera a tríade (server-side, mesmo módulo do preview → anti-drift)
    const { tokens_light, tokens_dark } = gerarTriade(sementeHsl, { manterMarsala })

    // 2. Gate AA (architecture §6.1) — reprovada NÃO chama RPC
    const resultadoAA = validarAA(tokens_light, tokens_dark)
    if (!resultadoAA.ok) {
      const detalhe = resultadoAA.falhas.join('; ')
      return {
        ok: false,
        error: `Paleta reprovada no gate de acessibilidade (WCAG AA). Ajuste a cor-semente para corrigir: ${detalhe}`,
      }
    }

    // 3. Chama salvar_paleta (RPC definer — aprovada_aa=true gravado pelo servidor)
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('salvar_paleta', {
      p_id: id ?? null,
      p_escopo: escopo,
      p_empresa_id: empresaId,
      p_nome: nome,
      p_semente: sementeHsl,
      p_light: tokens_light,
      p_dark: tokens_dark,
    })

    if (error) {
      return {
        ok: false,
        error: _humanizarErroBanco(error.message),
      }
    }

    return { ok: true, data }
  } catch {
    return { ok: false, error: 'Erro interno ao salvar a paleta. Tente novamente.' }
  }
}

// ─── definirOficialAtiva ──────────────────────────────────────────────────────

/**
 * Torna uma paleta oficial a ativa site-wide.
 * Chama ativar_paleta(p_id) — RPC unificada (contrato A2).
 *
 * contracts/paleta.md §4 / tasks.md T13
 */
export async function definirOficialAtiva(paletaId: string): Promise<ActionResult> {
  const result = await _chamarAtivarPaleta(paletaId)
  if (result.ok) revalidatePath('/', 'layout')
  return result
}

// ─── ativarPaletaEmpresa ──────────────────────────────────────────────────────

/**
 * Ativa paleta de empresa.
 * Chama a MESMA RPC ativar_paleta(p_id) — contrato A2(a).
 *
 * contracts/paleta.md §4 / tasks.md T13
 */
export async function ativarPaletaEmpresa(paletaId: string): Promise<ActionResult> {
  const result = await _chamarAtivarPaleta(paletaId)
  if (result.ok) revalidatePath('/admin/paletas')
  return result
}

// ─── excluirPaleta ────────────────────────────────────────────────────────────

/**
 * Soft-delete de paleta.
 * contracts/paleta.md §5 / tasks.md T13
 */
export async function excluirPaleta(paletaId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('excluir_paleta', { p_id: paletaId })
    if (error) return { ok: false, error: _humanizarErroBanco(error.message) }
    revalidatePath('/admin/paletas')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Erro interno ao excluir a paleta. Tente novamente.' }
  }
}

// ─── restaurarPaleta ──────────────────────────────────────────────────────────

/**
 * Restaura paleta do soft-delete.
 * Chama restore_record('paleta', id).
 * contracts/paleta.md §6 / tasks.md T13
 */
export async function restaurarPaleta(paletaId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('restore_record', {
      p_tabela: 'paleta',
      p_id: paletaId,
    })
    if (error) return { ok: false, error: _humanizarErroBanco(error.message) }
    revalidatePath('/admin/paletas')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Erro interno ao restaurar a paleta. Tente novamente.' }
  }
}

// ─── helpers privados ─────────────────────────────────────────────────────────

async function _chamarAtivarPaleta(paletaId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('ativar_paleta', { p_id: paletaId })
    if (error) return { ok: false, error: _humanizarErroBanco(error.message) }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Erro interno ao ativar a paleta. Tente novamente.' }
  }
}

// ─── listarPaletas ────────────────────────────────────────────────────────────

/**
 * Tipo da linha retornada pelo adapter de leitura — consumido pelo RSC page.tsx
 * e pelo Client Component PaletasView.
 */
export interface PaletaItemRow {
  id: string
  nome: string
  escopo: 'oficial' | 'empresa'
  empresaId: string | null
  empresaNome: string | null
  ativa: boolean
  aprovadaAA: boolean
  sementeHsl: string | null
  tokensLight: Record<string, string>
  tokensDark: Record<string, string>
  criadoEm: string | null
  adminEmail: string | null
  deletedAt: string | null
  /** Empresa foi deletada ou mergeada (CA9b) */
  empresaAusente: boolean
}

/**
 * Lê TODAS as paletas (oficiais + empresa) do banco via RLS.
 * Admin vê tudo por política; inclui deletadas p/ restauração (CA15/CA16).
 * Faz join com empresa para trazer nome_canonico (design §5.4 / MEN-5).
 *
 * Retorna array vazio em erro (fail-safe — site não quebra sem paletas).
 */
export async function listarPaletas(): Promise<PaletaItemRow[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('paleta')
      .select(`
        id, escopo, empresa_id, nome, semente_hsl,
        tokens_light, tokens_dark,
        aprovada_aa, ativa,
        created_at, deleted_at,
        empresa ( nome_canonico, deleted_at, merged_into )
      `)
      .order('created_at', { ascending: false })

    if (error || !data) return []

    // Supabase tipagem do join pode ser array ou objeto — cast via unknown p/ controlar
    return (data as unknown as _PaletaRow[]).map((row): PaletaItemRow => {
      // join FK many-to-one: empresa retorna objeto único ou null (não array)
      const emp = row.empresa as _EmpresaJoin | null

      // Determina se a empresa está ausente (deletada ou mergeada — CA9b)
      const empresaAusente =
        row.escopo === 'empresa' && emp !== null
          ? Boolean(emp.deleted_at || emp.merged_into)
          : row.escopo === 'empresa' && row.empresa_id !== null && emp === null

      return {
        id: row.id,
        nome: row.nome,
        escopo: row.escopo,
        empresaId: row.empresa_id ?? null,
        empresaNome: emp?.nome_canonico ?? null,
        ativa: row.ativa,
        aprovadaAA: row.aprovada_aa,
        sementeHsl: row.semente_hsl ?? null,
        tokensLight: (row.tokens_light ?? {}) as Record<string, string>,
        tokensDark: (row.tokens_dark ?? {}) as Record<string, string>,
        criadoEm: row.created_at ?? null,
        adminEmail: null, // criado_por não retornado nesta query — auditoria via audit log
        deletedAt: row.deleted_at ?? null,
        empresaAusente,
      }
    })
  } catch {
    return []
  }
}

// ─── Tipos internos do join ────────────────────────────────────────────────────
interface _EmpresaJoin {
  nome_canonico: string | null
  deleted_at: string | null
  merged_into: string | null
}

interface _PaletaRow {
  id: string
  escopo: 'oficial' | 'empresa'
  empresa_id: string | null
  nome: string
  semente_hsl: string | null
  tokens_light: Record<string, string> | null
  tokens_dark: Record<string, string> | null
  aprovada_aa: boolean
  ativa: boolean
  created_at: string | null
  deleted_at: string | null
  empresa: _EmpresaJoin | null
}

// ─── listarEmpresasAdmin ──────────────────────────────────────────────────────

export interface EmpresaAdminItem {
  id: string
  nomeCanonico: string
}

/**
 * Lista empresas ativas (não deletadas, não mergeadas) para o combobox do editor.
 * Retorna array vazio em erro (fail-safe).
 */
export async function listarEmpresasAdmin(): Promise<EmpresaAdminItem[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('empresa')
      .select('id, nome_canonico')
      .is('deleted_at', null)
      .order('nome_canonico', { ascending: true })

    if (error || !data) return []

    return (data as Array<{ id: string; nome_canonico: string }>).map((row) => ({
      id: row.id,
      nomeCanonico: row.nome_canonico,
    }))
  } catch {
    return []
  }
}

// ─── helpers privados ─────────────────────────────────────────────────────────

/**
 * Mapeia mensagens de erro do banco para PT-BR sem vazar stack (RS-P7).
 */
function _humanizarErroBanco(msg: string): string {
  if (!msg) return 'Erro desconhecido. Tente novamente.'
  const m = msg.toLowerCase()
  if (m.includes('apenas admin')) return 'Permissão negada. Apenas administradores podem gerenciar paletas.'
  if (m.includes('aprovada_aa')) return 'Esta paleta não passou no gate de acessibilidade. Ative apenas paletas aprovadas.'
  if (m.includes('unique') || m.includes('já existe')) return 'Já existe uma paleta ativa neste escopo. Desative a atual antes de ativar outra.'
  if (m.includes('foreign key') || m.includes('empresa')) return 'Empresa não encontrada ou inválida.'
  if (m.includes('hsl') || m.includes('check') || m.includes('constraint')) return 'Formato de token inválido. Verifique os valores HSL.'
  return 'Erro ao processar a paleta. Tente novamente.'
}
