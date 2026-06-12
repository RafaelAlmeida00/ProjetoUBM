import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DorDetalhe } from '@/components/dores/DorDetalhe'
import type { DorData, AnexoComUrl } from '@/components/dores/DorDetalhe'
import { obterEquipePublica, obterTimelinePublica } from '@/lib/data/projetos'
import type { MembroPublico, EventoTimeline } from '@/lib/data/projetos'

interface Props {
  params: Promise<{ id: string }>
}

/**
 * T8 + Delta 3 — /app/dores/[id] (RSC): detalhe da dor.
 * Delta 3: busca anexos (anexo_dor where dor_id, deleted_at is null) + signed URLs.
 * Passa isAutorEditavel (autor && status in rascunho/rejeitada) para DorDetalhe.
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

  // Papel do usuário (admin?)
  let isAdmin = false
  if (user) {
    const { data: { user: me } } = await supabase.auth.getUser()
    isAdmin = !!(me?.app_metadata?.is_admin)
  }

  // Se RLS não retornou (dor não-pública a este usuário), mostra locked via componente
  if (!dor) {
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
    return (
      <DorDetalhe
        dor={dorFicticia}
        currentUserId={user?.id ?? null}
        isAdmin={false}
        anexos={[]}
        isAutorEditavel={false}
        equipe={[]}
        timeline={[]}
      />
    )
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

  // Anexos (Delta 3) — busca metadados + gera signed URLs (bucket privado)
  const { data: anexosData } = await supabase
    .from('anexo_dor')
    .select('id, nome_original, mime_type, tamanho_bytes, storage_path')
    .eq('dor_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const anexos: AnexoComUrl[] = await Promise.all(
    (anexosData ?? []).map(async (a) => {
      const { data: signed } = await supabase.storage
        .from('dor-anexos')
        .createSignedUrl(a.storage_path as string, 3600)
      return {
        id: a.id as string,
        nome_original: a.nome_original as string,
        mime_type: a.mime_type as string,
        tamanho_bytes: a.tamanho_bytes as number,
        signedUrl: signed?.signedUrl ?? '',
      }
    })
  )

  // isAutorEditavel: autor + dor em rascunho ou rejeitada (Delta 3)
  const isAutor = !!user && user.id === dor.autor_id
  const isAutorEditavel = isAutor && (dor.status_dor === 'rascunho' || dor.status_dor === 'rejeitada')

  // P1.1 (005): equipe e timeline pública via projeto vinculado à dor
  let equipe: MembroPublico[] = []
  let timeline: EventoTimeline[] = []
  const { data: projetoVinculado } = await supabase
    .from('projeto')
    .select('id')
    .eq('dor_id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (projetoVinculado?.id) {
    ;[equipe, timeline] = await Promise.all([
      obterEquipePublica(projetoVinculado.id),
      obterTimelinePublica(projetoVinculado.id),
    ])
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

  return (
    <DorDetalhe
      dor={dorData}
      currentUserId={user?.id ?? null}
      isAdmin={isAdmin}
      anexos={anexos}
      isAutorEditavel={isAutorEditavel}
      equipe={equipe}
      timeline={timeline}
    />
  )
}
