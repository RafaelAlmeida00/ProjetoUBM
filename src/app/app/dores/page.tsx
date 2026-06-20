import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DoresPage } from '@/components/dores/DoresPage'
import type { DorCard } from '@/components/dores/DoresPage'
import { obterMeusVinculosProjeto } from '@/lib/data/projetos'

/**
 * T7 — /app/dores (RSC): vitrine de dores publicadas + minhas dores.
 * Lê sob RLS: anon/aluno/coord vê só publicadas; autor vê as próprias.
 *
 * B-003 fix: colunas reais do schema —
 *   dor.status_dor        (era "status")
 *   dor.created_at        (era "criada_em")
 *   perfil.user_id        (era "id")
 *   papel_usuario.role    (era "papel")
 */
export default async function DoresRoutePage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Dores publicadas (RLS: todos podem ler)
  // projeto(status) via FK dor_id — uq_projeto_dor garante 0 ou 1 linha por dor (ADR-0002 Q1)
  const { data: publicadas } = await supabase
    .from('dor')
    .select('id, empresa_id, descricao, titulo, status_dor, publicada_em, aprovado_por, projeto(id, status)')
    .eq('status_dor', 'publicada')
    .order('publicada_em', { ascending: false })
    .limit(50)

  // Minhas dores (RLS: só o autor vê as próprias)
  let minhasDores: DorCard[] = []
  let isRepresentante = false
  let isVerificado = false
  // temPapel: true quando usuário tem ao menos um papel (aluno/coord/rep).
  // false só quando autenticado sem nenhum papel → exibe CTA de onboarding.
  let temPapel = false
  let papelUsuario: 'aluno' | 'coordenador' | 'representante' | undefined
  let vinculosUsuario: Awaited<ReturnType<typeof obterMeusVinculosProjeto>> | undefined

  if (user) {
    const { data: perfil } = await supabase
      .from('perfil')
      .select('verificado_em')
      .eq('user_id', user.id)
      .single()

    isVerificado = !!perfil?.verificado_em

    const { data: papeis } = await supabase
      .from('papel_usuario')
      .select('role')
      .eq('user_id', user.id)

    isRepresentante = papeis?.some((p) => p.role === 'representante') ?? false
    temPapel = (papeis?.length ?? 0) > 0

    // Papel base para o slot "Me indicar" (Onda 2 B6): precedência representante > coordenador > aluno
    if (isRepresentante) {
      papelUsuario = 'representante'
    } else if (papeis?.some((p) => p.role === 'coordenador')) {
      papelUsuario = 'coordenador'
    } else if (papeis?.some((p) => p.role === 'aluno')) {
      papelUsuario = 'aluno'
    }

    // Vínculos do usuário (indicações ativas + membros de equipe) — para derivar estado do slot
    if (papelUsuario === 'aluno' || papelUsuario === 'coordenador') {
      vinculosUsuario = await obterMeusVinculosProjeto()
    }

    if (isRepresentante) {
      const { data: minhas } = await supabase
        .from('dor')
        .select('id, empresa_id, descricao, titulo, status_dor, publicada_em, created_at, aprovado_por')
        .eq('autor_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      // Enriquece com nome da empresa
      const dorIds = minhas?.map((d) => d.empresa_id).filter(Boolean) ?? []
      let empresaMap: Record<string, string> = {}
      if (dorIds.length > 0) {
        const { data: empresas } = await supabase
          .from('empresa')
          .select('id, nome_canonico')
          .in('id', dorIds)
        empresaMap = Object.fromEntries(empresas?.map((e) => [e.id, e.nome_canonico]) ?? [])
      }

      // Cursos por dor
      const minhasIds = minhas?.map((d) => d.id) ?? []
      let cursosMap: Record<string, string[]> = {}
      if (minhasIds.length > 0) {
        const { data: dc } = await supabase
          .from('dor_curso')
          .select('dor_id, curso')
          .in('dor_id', minhasIds)
        cursosMap = (dc ?? []).reduce<Record<string, string[]>>((acc, row) => {
          if (!acc[row.dor_id]) acc[row.dor_id] = []
          acc[row.dor_id].push(row.curso)
          return acc
        }, {})
      }

      minhasDores = (minhas ?? []).map((d) => ({
        id: d.id,
        titulo: (d as { titulo?: string | null }).titulo ?? null,
        empresa_nome: empresaMap[d.empresa_id] ?? 'Empresa',
        descricao: d.descricao,
        status: d.status_dor,
        cursos: cursosMap[d.id] ?? [],
        publicada_em: d.publicada_em,
        criada_em: d.created_at,
        aprovado_por: d.aprovado_por,
      }))
    }
  }

  // Enriquece publicadas com nome da empresa
  const pubEmpIds = publicadas?.map((d: { empresa_id: string }) => d.empresa_id).filter(Boolean) ?? []
  let pubEmpMap: Record<string, string> = {}
  if (pubEmpIds.length > 0) {
    const { data: emps } = await supabase
      .from('empresa')
      .select('id, nome_canonico')
      .in('id', pubEmpIds)
    pubEmpMap = Object.fromEntries(emps?.map((e) => [e.id, e.nome_canonico]) ?? [])
  }

  // Cursos das publicadas
  const pubIds = publicadas?.map((d: { id: string }) => d.id) ?? []
  let pubCursosMap: Record<string, string[]> = {}
  if (pubIds.length > 0) {
    const { data: dc } = await supabase
      .from('dor_curso')
      .select('dor_id, curso')
      .in('dor_id', pubIds)
    pubCursosMap = (dc ?? []).reduce<Record<string, string[]>>((acc, row) => {
      if (!acc[row.dor_id]) acc[row.dor_id] = []
      acc[row.dor_id].push(row.curso)
      return acc
    }, {})
  }

  const doresPublicadas: DorCard[] = (publicadas ?? []).map((d: {
    id: string; empresa_id: string; descricao: string; titulo: string | null; status_dor: 'publicada'
    publicada_em: string | null; aprovado_por: string | null
    projeto: { id: string; status: string } | { id: string; status: string }[] | null
  }) => {
    // projeto pode ser null (sem projeto), objeto único ou array (PostgREST FK)
    const projetoArr = Array.isArray(d.projeto) ? d.projeto : (d.projeto ? [d.projeto] : [])
    // uq_projeto_dor garante 0 ou 1 projeto ativo por dor → pega o primeiro com id.
    const projetoAtivo = projetoArr.find((p) => p?.id)
    return {
      id: d.id,
      titulo: d.titulo,
      empresa_nome: pubEmpMap[d.empresa_id] ?? 'Empresa',
      descricao: d.descricao,
      status: d.status_dor,
      cursos: pubCursosMap[d.id] ?? [],
      publicada_em: d.publicada_em,
      aprovado_por: d.aprovado_por,
      projeto_status: projetoAtivo?.status as string | undefined,
      projeto_id: projetoAtivo?.id as string | undefined,
    }
  })

  return (
    <DoresPage
      doresPublicadas={doresPublicadas}
      minhasDores={minhasDores}
      isRepresentante={isRepresentante}
      isVerificado={isVerificado}
      isAutenticado={!!user}
      temPapel={temPapel}
      papelUsuario={papelUsuario}
      vinculosUsuario={vinculosUsuario}
    />
  )
}
