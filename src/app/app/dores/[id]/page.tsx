import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DorDetalhe } from '@/components/dores/DorDetalhe'
import type { DorData, AnexoComUrl } from '@/components/dores/DorDetalhe'
import {
  obterEquipePublica, obterTimelinePublica,
  listarFuncoesTarefas, listarIndicacoes, listarEquipeGestao,
} from '@/lib/data/projetos'
import { obterTimelineDor } from '@/lib/data/dores'
import { rotuloProjeto } from '@/lib/format/projeto'
import type { MembroPublico, EventoTimeline, FuncaoTarefa, MembroGestao } from '@/lib/data/projetos'
import type { EventoTimelineDor } from '@/lib/data/dores'
import type { GrupoIndicacoes } from '@/components/indicacoes/IndicacoesRecebidas'

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
    .select('id, autor_id, empresa_id, descricao, titulo, status_dor, publicada_em, created_at, aprovado_por, motivo_rejeicao')
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
      titulo: null,
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

  // isAutorEditavel (Delta-edição / 0051 + ruling cyber): o autor dono e VERIFICADO
  // pode editar a dor em qualquer status editável — rascunho, rejeitada, em_moderacao
  // e PUBLICADA (editar publicada/em_moderacao re-entra em moderação; a vitrine esconde
  // até reaprovar). editar_dor enforce o mesmo gate no banco (RS-ED1/RS-ED5).
  const isAutor = !!user && user.id === dor.autor_id
  let autorVerificado = false
  if (isAutor) {
    const { data: perfilAutor } = await supabase
      .from('perfil')
      .select('verificado_em')
      .eq('user_id', user!.id)
      .maybeSingle()
    autorVerificado = !!perfilAutor?.verificado_em
  }
  const STATUS_EDITAVEIS = ['rascunho', 'rejeitada', 'em_moderacao', 'publicada']
  const isAutorEditavel = isAutor && autorVerificado && STATUS_EDITAVEIS.includes(dor.status_dor)

  // Linha do tempo append-only da própria dor (0051 ler_timeline_dor) — antes não era
  // buscada nem passada, então a aba "Linha do tempo da dor" ficava sempre vazia.
  const timelineDor: EventoTimelineDor[] = await obterTimelineDor(id)

  // 009 T5 — projeto vinculado + papéis + fetches GATED no servidor (gate-de-fetch; espelha /projetos/[id]).
  // PII (listarIndicacoes=nome/email; listarEquipeGestao=pessoa_id) SÓ dentro do branch de gate —
  // aluno/não-membro/não-coord nunca dispara o fetch (RS2/B1). equipe_publica/timeline são anonimizadas.
  let equipe: MembroPublico[] = []
  let timeline: EventoTimeline[] = []
  let projetoId: string | null = null
  let projetoStatus: string | null = null
  let hostElected = false
  let isHost = false
  let papelAtual: 'admin' | 'host' | 'aluno' | null = null
  let tarefas: FuncaoTarefa[] = []
  let gestao: MembroGestao[] = []
  let indicacoesGrupos: GrupoIndicacoes[] = []

  const { data: projetoVinculado } = await supabase
    .from('projeto')
    .select('id, status, host_coordenador_id')
    .eq('dor_id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (projetoVinculado?.id) {
    projetoId = projetoVinculado.id as string
    projetoStatus = projetoVinculado.status as string
    const hostId = (projetoVinculado.host_coordenador_id as string | null) ?? null
    hostElected = !!hostId
    isHost = !!user && hostId === user.id

    ;[equipe, timeline, tarefas] = await Promise.all([
      obterEquipePublica(projetoId),
      obterTimelinePublica(projetoId),
      user ? listarFuncoesTarefas(projetoId) : Promise.resolve([] as FuncaoTarefa[]),
    ])

    const isMembro = isAdmin || isHost || tarefas.length > 0
    papelAtual = isAdmin ? 'admin' : isHost ? 'host' : isMembro ? 'aluno' : null

    // Gestão de membros (pessoa_id) — SÓ admin/host (gate-de-fetch; PII).
    if (isAdmin || isHost) {
      gestao = await listarEquipeGestao(projetoId)
    }

    // Indicações recebidas — fetch coarse (admin/host/coordenador-aprovado); DISPLAY pelo RETORNO (B2:
    // coord-de-outro-curso recebe [] da RPC → seção some). PII só dentro deste gate.
    const roles = (user?.app_metadata?.roles as string[] | undefined) ?? []
    const coordAprovado = roles.includes('coordenador') && !!user?.app_metadata?.coord_aprovado
    if (isAdmin || isHost || coordAprovado) {
      const inds = await listarIndicacoes(projetoId)
      if (inds.length > 0) {
        indicacoesGrupos = [{ projetoId, rotulo: rotuloProjeto(dor.titulo, empresa_nome), indicacoes: inds }]
      }
    }
  }

  const dorData: DorData = {
    id: dor.id,
    titulo: dor.titulo ?? null,
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
      timelineDor={timelineDor}
      projetoId={projetoId}
      projetoStatus={projetoStatus}
      hostElected={hostElected}
      papelAtual={papelAtual}
      gestao={gestao}
      indicacoesGrupos={indicacoesGrupos}
      tarefas={tarefas}
    />
  )
}
