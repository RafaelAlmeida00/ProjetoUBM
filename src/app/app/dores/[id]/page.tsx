import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DorDetalhe } from '@/components/dores/DorDetalhe'
import type { DorData } from '@/components/dores/DorDetalhe'

interface Props {
  params: Promise<{ id: string }>
}

/**
 * T8 — /app/dores/[id] (RSC): detalhe da dor (parcial — timeline/equipe = 005).
 * RLS controla acesso: publicada=todos; não-publicada=autor+admin.
 * Se RLS barrar (sem dado), exibe ubm-locked via DorDetalhe (CA18).
 *
 * B-003 fix: colunas reais do schema —
 *   dor.status_dor  (era "status")
 *   dor.created_at  (era "criada_em")
 */
export default async function DorDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Busca a dor (RLS aplica: não-publicada só autor+admin recebem linha)
  const { data: dor } = await supabase
    .from('dor')
    .select('id, autor_id, empresa_id, descricao, status_dor, publicada_em, created_at, aprovado_por, motivo_rejeicao')
    .eq('id', id)
    .single()

  // Se RLS não retornou (dor não-pública a este usuário), mostra locked via componente
  if (!dor) {
    // Cria um objeto fictício para exibir o locked (sem vazar dados)
    const dorFicticia: DorData = {
      id,
      empresa_nome: '',
      descricao: '',
      status: 'em_moderacao',
      cursos: [],
      autor_id: '__unknown__',
      aprovado_por: null,
      motivo_rejeicao: null,
    }
    return <DorDetalhe dor={dorFicticia} currentUserId={user?.id ?? null} isAdmin={false} />
  }

  // Enriquece com empresa
  let empresa_nome = 'Empresa'
  if (dor.empresa_id) {
    const { data: emp } = await supabase
      .from('empresa')
      .select('nome_canonico')
      .eq('id', dor.empresa_id)
      .single()
    if (emp) empresa_nome = emp.nome_canonico
  }

  // Cursos
  const { data: dc } = await supabase
    .from('dor_curso')
    .select('curso')
    .eq('dor_id', id)
  const cursos = dc?.map((r) => r.curso) ?? []

  // Papel do usuário (admin?)
  let isAdmin = false
  if (user) {
    const { data: { user: me } } = await supabase.auth.getUser()
    isAdmin = !!(me?.app_metadata?.is_admin)
  }

  const dorData: DorData = {
    id: dor.id,
    empresa_nome,
    descricao: dor.descricao,
    status: dor.status_dor,
    cursos,
    publicada_em: dor.publicada_em,
    criada_em: dor.created_at,
    aprovado_por: dor.aprovado_por,
    motivo_rejeicao: dor.motivo_rejeicao,
    autor_id: dor.autor_id,
  }

  return <DorDetalhe dor={dorData} currentUserId={user?.id ?? null} isAdmin={isAdmin} />
}
