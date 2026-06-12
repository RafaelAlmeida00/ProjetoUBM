import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AdminDoresPage } from '@/components/admin/AdminDoresPage'
import type { DorModeracaoItem } from '@/components/admin/AdminDoresPage'

/**
 * T9 — /admin/dores (RSC): fila de moderação.
 * Middleware já barra não-admin; RLS reforça no banco.
 */
export default async function AdminDoresRoutePage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/dores')

  const isAdmin = !!(user.app_metadata?.is_admin)

  // Busca dores em_moderacao (RLS só permite admin)
  const { data: dores } = await supabase
    .from('dor')
    .select('id, autor_id, empresa_id, descricao, status_dor, created_at, aprovado_por, motivo_rejeicao')
    .eq('status_dor', 'em_moderacao')
    .order('created_at', { ascending: true })
    .limit(100)

  // Enriquece com empresa
  const empIds = [...new Set((dores ?? []).map((d: { empresa_id: string }) => d.empresa_id).filter(Boolean))]
  let empMap: Record<string, string> = {}
  if (empIds.length > 0) {
    const { data: emps } = await supabase
      .from('empresa')
      .select('id, nome_canonico')
      .in('id', empIds)
    empMap = Object.fromEntries(emps?.map((e) => [e.id, e.nome_canonico]) ?? [])
  }

  // Cursos
  const dorIds = (dores ?? []).map((d: { id: string }) => d.id)
  let cursosMap: Record<string, string[]> = {}
  if (dorIds.length > 0) {
    const { data: dc } = await supabase
      .from('dor_curso')
      .select('dor_id, curso')
      .in('dor_id', dorIds)
    cursosMap = (dc ?? []).reduce<Record<string, string[]>>((acc, row) => {
      if (!acc[row.dor_id]) acc[row.dor_id] = []
      acc[row.dor_id].push(row.curso)
      return acc
    }, {})
  }

  // Verifica quais autores já têm conta verificada (só para dores com autor — T-AN15)
  const autorIds = [...new Set((dores ?? []).map((d: { autor_id: string | null }) => d.autor_id).filter(Boolean))] as string[]
  let verificadoMap: Record<string, boolean> = {}
  if (autorIds.length > 0) {
    const { data: perfis } = await supabase
      .from('perfil')
      .select('user_id, verificado_em')
      .in('user_id', autorIds)
    verificadoMap = Object.fromEntries(perfis?.map((p) => [p.user_id, !!p.verificado_em]) ?? [])
  }

  const doresEmModeracao: DorModeracaoItem[] = (dores ?? []).map((d: {
    id: string; autor_id: string | null; empresa_id: string | null; descricao: string
    status_dor: 'em_moderacao'; created_at: string; aprovado_por: string | null
    motivo_rejeicao: string | null
  }) => ({
    id: d.id,
    // empresa_id pode ser null para dores órfãs com empresa diferida (E.3 — T-AN15)
    empresa_nome: d.empresa_id ? (empMap[d.empresa_id] ?? 'Empresa desconhecida') : 'Empresa desconhecida',
    descricao: d.descricao,
    status: d.status_dor,
    cursos: cursosMap[d.id] ?? [],
    criada_em: d.created_at,
    aprovado_por: d.aprovado_por,
    motivo_rejeicao: d.motivo_rejeicao,
    // autor_id pode ser null para dores órfãs (T-AN15/SR-A6)
    autor_id: d.autor_id,
    autor_verificado: d.autor_id ? (verificadoMap[d.autor_id] ?? false) : false,
  }))

  return <AdminDoresPage doresEmModeracao={doresEmModeracao} isAdmin={isAdmin} />
}
