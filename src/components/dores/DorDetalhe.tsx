'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Lock, CornerUpLeft, AlertCircle, CheckCircle2, Clock, Download, Trash2, Info, Send } from 'lucide-react'
import { StatusDor } from './StatusDor'
import { MeIndicarSlot, type EstadoIndicacao } from '@/components/dores/MeIndicarSlot'
import { indicarSe, retirarIndicacao } from '@/lib/actions/indicacao'
import { submeterDor, editarDor } from '@/lib/actions/dor'
import { removerAnexo } from '@/lib/actions/anexo'
import { useToast } from '@/components/feedback/ToastProvider'
import { AnexoUploader } from '@/components/anexos/AnexoUploader'
import { CourseMultiSelect } from '@/components/course/CourseMultiSelect'
import { CURSOS_UBM } from '@/lib/courses'
import { rotuloProjeto } from '@/lib/format/projeto'
import { UbmTabs } from '@/components/ubm-tabs'
import { UbmTimeline } from '@/components/ubm-timeline'
import { UbmTeam } from '@/components/ubm-team'
import { ProjetoDetalheClient } from '@/components/dores/ProjetoDetalheClient'
import { IndicacoesRecebidas } from '@/components/indicacoes/IndicacoesRecebidas'
import { SecaoProposta } from '@/components/proposta/SecaoProposta'
import type { AnexoMeta } from '@/lib/actions/anexo'
import type { CursoUbm } from '@/lib/courses'
import type { MembroPublico, EventoTimeline, FuncaoTarefa, MembroGestao } from '@/lib/data/projetos'
import type { EventoTimelineDor } from '@/lib/data/dores'
import type { GrupoIndicacoes } from '@/components/indicacoes/IndicacoesRecebidas'
import type { DadosProposta } from '@/lib/data/proposta'
import type { PapelProposta } from '@/components/proposta/SecaoProposta'

export interface DorData {
  id: string
  /** 009 — título do projeto (vem da dor); compõe "Título — Empresa" / fallback empresa. */
  titulo?: string | null
  empresa_nome: string
  descricao: string
  status: 'rascunho' | 'em_moderacao' | 'publicada' | 'rejeitada'
  cursos: string[]
  publicada_em?: string | null
  criada_em?: string | null
  aprovado_por?: string | null
  motivo_rejeicao?: string | null
  autor_id: string
}

/** Anexo com signed URL para download (bucket privado) */
export interface AnexoComUrl extends AnexoMeta {
  signedUrl: string
}

interface DorDetalheProps {
  dor: DorData
  currentUserId: string | null
  isAdmin: boolean
  /** Anexos da dor (com signed URLs) — passados pelo RSC */
  anexos?: AnexoComUrl[]
  /** true quando o usuário logado é o autor E a dor está em {rascunho, rejeitada, em_moderacao, publicada} */
  isAutorEditavel?: boolean
  /** P1.1 (005): equipe pública do projeto vinculado a esta dor */
  equipe?: MembroPublico[]
  /** P1.1 (005): timeline pública do projeto vinculado a esta dor */
  timeline?: EventoTimeline[]
  /** Delta-edição: linha do tempo append-only da própria dor (ler_timeline_dor) */
  timelineDor?: EventoTimelineDor[]
  /** 009 — projeto vinculado + papel/gates para a zona de gestão (host/admin) e indicações (coord/admin).
   *  Todos GATED pelo RSC: chegam vazios/null quando o papel não tem direito. */
  projetoId?: string | null
  projetoStatus?: string | null
  /** 0063 — janela de indicação aberta (independente do status); liga reabrir/encerrar e o "Me indicar". */
  indicacoesAbertas?: boolean
  hostElected?: boolean
  /** 0060 — pessoa_id do host eleito (para o team-builder entrar em modo composição). */
  hostPessoaId?: string | null
  papelAtual?: 'admin' | 'host' | 'aluno' | null
  gestao?: MembroGestao[]
  indicacoesGrupos?: GrupoIndicacoes[]
  tarefas?: FuncaoTarefa[]
  /** 009 — ação contextual "Me indicar" no detalhe (aluno/coord; só em_analise). */
  papelBaseIndicacao?: 'aluno' | 'coordenador' | null
  estadoIndicacao?: EstadoIndicacao
  /** T5.4 (006) — dados de proposta/assinatura, lidos pelo RSC sob RLS. Null = sem projeto. */
  dadosProposta?: DadosProposta | null
  /** T5.4 (006) — papel do usuário na proposta (gating server-side). */
  papelProposta?: PapelProposta
  /** T5.4 (006) — nome/email do representante (para envio Caminho A). */
  representanteNome?: string
  representanteEmail?: string
}

function labelCurso(value: string): string {
  return CURSOS_UBM.find((c) => c.value === value)?.label ?? value
}

/** Formata data ISO em pt-BR curto: "01 jun. 2026" */
function formatarDataPtBR(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/** Rótulos de papel do ator para exibição */
const PAPEL_LABELS: Record<string, string> = {
  representante: 'Representante',
  admin: 'Admin UBM',
  sistema: 'Sistema',
}

/**
 * DorTimeline — linha do tempo append-only da própria dor.
 * Renderiza eventos retornados por ler_timeline_dor: rotulo + ator_papel + data.
 * Semântica ol/li; nunca só cor; a11y WCAG AA.
 */
function DorTimeline({ eventos }: { eventos: EventoTimelineDor[] }) {
  return (
    <div className="ubm-dor-timeline">
      <ol className="ubm-dor-timeline-list" aria-label="Histórico de eventos da dor">
        {eventos.map((evt, i) => (
          <li key={`${evt.tipo}-${i}`} className="ubm-dor-timeline-item">
            <span className="ubm-dor-timeline-pin" aria-hidden="true" />
            <div className="ubm-dor-timeline-body ubm-machined">
              <span className="ubm-cota ubm-dor-timeline-rotulo">{evt.rotulo}</span>
              <span className="ubm-cota ubm-cota--muted ubm-dor-timeline-papel">
                {PAPEL_LABELS[evt.ator_papel] ?? evt.ator_papel}
              </span>
              {evt.ocorreu_em && (
                <time
                  className="ubm-cota ubm-cota--muted ubm-dor-timeline-data"
                  dateTime={evt.ocorreu_em}
                >
                  {formatarDataPtBR(evt.ocorreu_em)}
                </time>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * T8 + Delta 3 — /app/dores/[id]: visão da dor.
 * Extensões Delta 3:
 *   - isAutorEditavel: seção de edição (descrição + cursos) + AnexoUploader não-readOnly
 *   - publicada + anexos: lista de download (signed URLs, readOnly)
 *   - isAdmin + anexos: botão "Remover" por anexo (confirmação + removerAnexo)
 */
export function DorDetalhe({
  dor,
  currentUserId,
  isAdmin,
  anexos = [],
  isAutorEditavel = false,
  equipe = [],
  timeline = [],
  timelineDor = [],
  projetoId = null,
  projetoStatus = null,
  indicacoesAbertas = false,
  hostElected = false,
  hostPessoaId = null,
  papelAtual = null,
  gestao = [],
  indicacoesGrupos = [],
  tarefas = [],
  papelBaseIndicacao = null,
  estadoIndicacao,
  dadosProposta = null,
  papelProposta,
  representanteNome,
  representanteEmail,
}: DorDetalheProps) {
  const toast = useToast()

  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')

  // Estado de edição
  const [descricaoEdit, setDescricaoEdit] = useState(dor.descricao)
  const [cursosEdit, setCursosEdit] = useState<CursoUbm[]>(
    (dor.cursos as CursoUbm[]).filter((c) => CURSOS_UBM.some((cu) => cu.value === c))
  )
  const [salvando, setSalvando] = useState(false)
  const [erroEdicao, setErroEdicao] = useState('')
  const [salvoOk, setSalvoOk] = useState(false)

  // Estado da lista de anexos (para admin remover)
  const [anexosList, setAnexosList] = useState<AnexoComUrl[]>(anexos)
  const [erroAnexo, setErroAnexo] = useState('')

  const isAutor = !!currentUserId && currentUserId === dor.autor_id
  const isAprovadaAguardando = dor.status === 'em_moderacao' && !!dor.aprovado_por

  /* ── Controle de acesso visual (CA18) ─────────────────────── */
  const podeVer = dor.status === 'publicada' || isAutor || isAdmin
  if (!podeVer) {
    return (
      <article className="ubm-section" style={{ maxWidth: '40rem' }}>
        <div className="ubm-locked">
          <Lock className="ubm-locked-icon" aria-hidden />
          <span className="ubm-cota">RESTRITO</span>
          <p className="ubm-locked-title">Esta dor não está pública.</p>
          <p className="ubm-locked-msg">
            Visível apenas ao autor e à moderação da UBM.
          </p>
        </div>
      </article>
    )
  }

  /* ── Reenvio (rejeitada → em_moderacao, CA9) ──────────────── */
  const handleReenviar = async () => {
    setEnviando(true)
    setErroEnvio('')
    const result = await submeterDor(dor.id)
    setEnviando(false)
    if (result.ok) {
      setEnviado(true)
      toast.sucesso('Dor enviada para análise.')
    } else {
      setErroEnvio(result.error)
      toast.erro(result.error || 'Não foi possível enviar sua dor. Tente novamente.')
    }
  }

  /* ── Salvar edição ── */
  const handleSalvar = async () => {
    setSalvando(true)
    setErroEdicao('')
    setSalvoOk(false)
    const result = await editarDor({
      dorId: dor.id,
      descricao: descricaoEdit.trim(),
      cursos: cursosEdit.length > 0 ? cursosEdit : undefined,
    })
    setSalvando(false)
    if (result.ok) {
      setSalvoOk(true)
      toast.sucesso('Alterações salvas.')
    } else {
      setErroEdicao(result.error)
      toast.erro(result.error || 'Não foi possível salvar as alterações. Tente novamente.')
    }
  }

  /* ── Admin: remover anexo impróprio ── */
  const handleRemoverAnexo = async (anexoId: string, nomeArquivo: string) => {
    const confirmado = window.confirm(`Remover o anexo "${nomeArquivo}"? Esta ação não pode ser desfeita.`)
    if (!confirmado) return
    setErroAnexo('')
    const result = await removerAnexo(anexoId)
    if (result.ok) {
      setAnexosList((prev) => prev.filter((a) => a.id !== anexoId))
      toast.sucesso('Anexo removido.')
    } else {
      setErroAnexo(result.error)
      toast.erro(result.error || 'Não foi possível remover o anexo. Tente novamente.')
    }
  }

  return (
    <article className="ubm-section" style={{ maxWidth: '56rem' }}>
      {/* ── Cabeçalho-carimbo ── */}
      <header className="ubm-page-header">
        <div className="ubm-breadcrumb">
          <span>APP</span>
          <span aria-hidden="true">/</span>
          <Link href="/app/dores" className="ubm-link">DORES</Link>
          <span aria-hidden="true">/</span>
          <b>{dor.empresa_nome.toUpperCase()}</b>
        </div>
        <div className="ubm-title-row">
          <h1 className="ubm-page-title">{rotuloProjeto(dor.titulo, dor.empresa_nome)}</h1>
          <StatusDor
            status={dor.status}
            aprovadoPor={dor.aprovado_por}
            pulso={dor.status === 'em_moderacao' && !dor.aprovado_por}
          />
        </div>
        <p className="ubm-cota ubm-cota--muted">
          {dor.publicada_em
            ? `Publicada em ${new Date(dor.publicada_em).toLocaleDateString('pt-BR')}`
            : dor.criada_em
              ? `Proposta em ${new Date(dor.criada_em).toLocaleDateString('pt-BR')}`
              : ''}
        </p>
      </header>

      {/* ── Ponte "aprovada-aguardando" (A1 CA10/CA11) ── */}
      {isAprovadaAguardando && isAutor && (
        <div
          className="ubm-machined"
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            borderColor: 'hsl(var(--info) / 0.5)',
            background: 'hsl(var(--info) / 0.08)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
            <Clock size={18} style={{ color: 'hsl(var(--info))', flexShrink: 0, marginTop: '0.15rem' }} aria-hidden />
            <div>
              <p style={{ fontWeight: 600, color: 'hsl(var(--info))' }}>
                Aprovada!
              </p>
              <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.95rem' }}>
                Falta só <strong>verificar seu e-mail</strong> para publicar.{' '}
                <Link href="/app/conta" className="ubm-link">
                  Ir para verificação →
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Motivo de rejeição (CA19 — só o autor vê) ── */}
      {dor.status === 'rejeitada' && dor.motivo_rejeicao && isAutor && (
        <div
          className="ubm-machined"
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            borderColor: 'hsl(var(--destructive) / 0.5)',
            background: 'hsl(var(--destructive) / 0.05)',
          }}
          aria-live="polite"
        >
          <p className="ubm-cota" style={{ color: 'hsl(var(--destructive))', marginBottom: '0.5rem' }}>
            Motivo da Revisão
          </p>
          <p style={{ color: 'hsl(var(--foreground))', lineHeight: 1.55 }}>
            {dor.motivo_rejeicao}
          </p>
          {!enviado ? (
            <div style={{ marginTop: '1rem' }}>
              {erroEnvio && (
                <p style={{ color: 'hsl(var(--destructive))', fontSize: '0.88rem', marginBottom: '0.5rem' }} role="alert">
                  <AlertCircle size={14} aria-hidden style={{ display: 'inline', marginRight: '0.3rem' }} />
                  {erroEnvio}
                </p>
              )}
              <button
                type="button"
                className="ubm-btn ubm-btn-secondary"
                onClick={handleReenviar}
                disabled={enviando}
                style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}
              >
                <CornerUpLeft size={15} aria-hidden />
                {enviando ? 'Enviando…' : 'Corrigir e reenviar'}
              </button>
            </div>
          ) : (
            <p style={{ marginTop: '0.75rem', color: 'hsl(var(--success))', fontWeight: 600, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <CheckCircle2 size={15} aria-hidden />
              Dor reenviada para moderação.
            </p>
          )}
        </div>
      )}

      {/* ── Corpo da dor ── */}
      <div className="ubm-article" style={{ maxWidth: '100%' }}>

        {/* ── Seção de EDIÇÃO (Delta-edição) — autor em qualquer status editável ── */}
        {isAutorEditavel && (
          <section className="ubm-section-block" aria-label="Editar dor">
            <h2 className="ubm-section-title">Editar a dor</h2>

            {/* Enviar rascunho à moderação (fix-fluxo): rascunho só é visto pelo autor —
                criar = enviar ao admin. Sem este botão, o rascunho era beco sem saída. */}
            {dor.status === 'rascunho' && isAutor && (
              <div
                className="ubm-machined"
                role="group"
                aria-label="Enviar rascunho para moderação"
                style={{
                  padding: '1rem 1.25rem',
                  marginBottom: '1rem',
                  borderColor: 'hsl(var(--primary) / 0.5)',
                  background: 'hsl(var(--primary) / 0.06)',
                }}
              >
                <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Pronto para enviar?</p>
                <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.92rem', marginBottom: '0.75rem' }}>
                  Este rascunho só é visível para você. Envie para a moderação da UBM analisar e publicar.
                </p>
                {erroEnvio && (
                  <p
                    role="alert"
                    style={{ color: 'hsl(var(--destructive))', fontSize: '0.88rem', marginBottom: '0.5rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}
                  >
                    <AlertCircle size={14} aria-hidden />
                    {erroEnvio}
                  </p>
                )}
                {!enviado ? (
                  <button
                    type="button"
                    className="ubm-btn ubm-btn-primary"
                    onClick={handleReenviar}
                    disabled={enviando}
                    style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}
                  >
                    <Send size={15} aria-hidden />
                    {enviando ? 'Enviando…' : 'Enviar para moderação'}
                  </button>
                ) : (
                  <p style={{ color: 'hsl(var(--success))', fontWeight: 600, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <CheckCircle2 size={15} aria-hidden />
                    Dor enviada para moderação.
                  </p>
                )}
              </div>
            )}

            {/* Aviso de re-moderação (cybersecurity ruling) — publicada ou em_moderacao */}
            {(dor.status === 'publicada' || dor.status === 'em_moderacao') && (
              <div
                className="ubm-machined ubm-aviso-remod"
                role="note"
                aria-label="Aviso de re-moderação"
                style={{
                  padding: '0.875rem 1rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  gap: '0.6rem',
                  alignItems: 'flex-start',
                  borderColor: 'hsl(var(--warning) / 0.6)',
                  background: 'hsl(var(--warning) / 0.07)',
                }}
              >
                <Info size={16} style={{ color: 'hsl(var(--warning))', flexShrink: 0, marginTop: '0.15rem' }} aria-hidden />
                <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'hsl(var(--foreground))' }}>
                  {dor.status === 'publicada'
                    ? 'Editar esta dor publicada vai enviá-la para nova moderação — ela sai da vitrine pública até ser reaprovada.'
                    : 'Editar esta dor vai reenviá-la para moderação. Aguarde a aprovação antes de ser publicada.'}
                </p>
              </div>
            )}

            <div
              className="ubm-machined"
              style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <label htmlFor="edit-descricao" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span className="ubm-cota">Descrição</span>
                <textarea
                  id="edit-descricao"
                  aria-label="Descrição"
                  value={descricaoEdit}
                  onChange={(e) => { setDescricaoEdit(e.target.value); setSalvoOk(false) }}
                  rows={5}
                  className="ubm-input"
                  style={{ resize: 'vertical' }}
                />
              </label>

              <CourseMultiSelect value={cursosEdit} onChange={(v) => { setCursosEdit(v); setSalvoOk(false) }} />

              {erroEdicao && (
                <p role="alert" style={{ color: 'hsl(var(--destructive))', fontSize: '0.88rem', display: 'flex', gap: '0.4rem' }}>
                  <AlertCircle size={14} aria-hidden />
                  {erroEdicao}
                </p>
              )}
              {salvoOk && (
                <p style={{ color: 'hsl(var(--success))', fontSize: '0.88rem', display: 'flex', gap: '0.4rem' }}>
                  <CheckCircle2 size={14} aria-hidden />
                  Dor salva com sucesso.
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="ubm-btn ubm-btn-primary"
                  onClick={handleSalvar}
                  disabled={salvando || descricaoEdit.trim().length < 10}
                  style={{ minWidth: '8rem' }}
                >
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>

            {/* AnexoUploader (RN14) — não readOnly para o autor editar */}
            <div style={{ marginTop: '1.25rem' }}>
              <AnexoUploader
                dorId={dor.id}
                anexos={anexosList}
                readOnly={false}
              />
            </div>
          </section>
        )}

        {/* ── Seção de VISUALIZAÇÃO da descrição ── */}
        {!isAutorEditavel && (
          <section className="ubm-section-block">
            <h2 className="ubm-section-title">A dor, nas palavras da empresa</h2>
            <p className="ubm-prose">{dor.descricao}</p>
          </section>
        )}

        {/* Cursos — modo visualização (fora de edição) */}
        {!isAutorEditavel && dor.cursos.length > 0 && (
          <section className="ubm-section-block">
            <h2 className="ubm-section-title">Cursos que podem encaixar</h2>
            <div className="ubm-dor-card-cursos">
              {dor.cursos.map((c) => (
                <span key={c} className="ubm-dor-card-curso">{labelCurso(c)}</span>
              ))}
            </div>
          </section>
        )}

        {/* ── Anexos publicada — lista de download (Delta 3) ── */}
        {dor.status === 'publicada' && anexosList.length > 0 && (
          <section className="ubm-section-block" aria-label="Anexos">
            <h2 className="ubm-section-title">Anexos</h2>
            {erroAnexo && (
              <p role="alert" style={{ color: 'hsl(var(--destructive))', fontSize: '0.88rem', marginBottom: '0.5rem' }}>
                {erroAnexo}
              </p>
            )}
            <ul className="ubm-attach-list" aria-label="Arquivos para download">
              {anexosList.map((a) => (
                <li key={a.id} className="ubm-attach-item">
                  <Download className="ubm-attach-item-icon" size={16} aria-hidden />
                  <div className="ubm-attach-item-body" style={{ flex: 1 }}>
                    <a
                      href={a.signedUrl}
                      download={a.nome_original}
                      className="ubm-attach-item-name ubm-link"
                      aria-label={a.nome_original}
                    >
                      {a.nome_original}
                    </a>
                    <span className="ubm-attach-item-meta">
                      {formatBytes(a.tamanho_bytes)}
                    </span>
                  </div>
                  {/* Admin: remover impróprio (RN14) */}
                  {isAdmin && (
                    <button
                      type="button"
                      className="ubm-attach-item-remove"
                      aria-label={`Remover ${a.nome_original}`}
                      onClick={() => handleRemoverAnexo(a.id, a.nome_original)}
                      style={{ color: 'hsl(var(--destructive))' }}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 009 T11 + 0063: "Me indicar" (aluno/coord) quando a janela está aberta (em_analise OU reaberta) ── */}
        {(projetoStatus === 'em_analise' || indicacoesAbertas) && papelBaseIndicacao && estadoIndicacao && projetoId && (
          <section className="ubm-section-block ubm-card-action-row">
            <MeIndicarSlot
              projetoId={projetoId}
              empresaNome={dor.empresa_nome}
              papelBase={papelBaseIndicacao}
              estado={estadoIndicacao}
              onIndicar={indicarSe}
              onRetirar={retirarIndicacao}
            />
          </section>
        )}

        {/* ── Andamento (jornada da dor) + equipe via UbmTabs (005 + Delta-edição) ── */}
        <section className="ubm-section-block">
          <h2 className="ubm-section-title">Andamento e equipe</h2>
          <UbmTabs
            aria-label="Linha do tempo e equipe do projeto"
            tabs={[
              /* BUG #1: projeto primeiro (cliente: ver avanço do projeto antes do histórico da dor) */
              {
                id: 'timeline',
                label: 'Andamento',
                content: timeline.length > 0
                  ? <UbmTimeline eventos={timeline} />
                  : (
                    <div className="ubm-empty">
                      <div className="ubm-empty-node" aria-hidden="true" />
                      <p className="ubm-empty-msg">Nenhum evento registrado ainda.</p>
                    </div>
                  ),
              },
              {
                id: 'timeline-dor',
                label: 'Linha do tempo da dor',
                content: timelineDor.length > 0
                  ? (
                    <DorTimeline eventos={timelineDor} />
                  )
                  : (
                    <div className="ubm-empty">
                      <div className="ubm-empty-node" aria-hidden="true" />
                      <p className="ubm-empty-msg">Nenhum evento registrado ainda.</p>
                    </div>
                  ),
              },
              {
                id: 'equipe',
                label: 'Equipe',
                content: equipe.length > 0
                  ? <UbmTeam membros={equipe} />
                  : (
                    <div className="ubm-empty">
                      <div className="ubm-empty-node" aria-hidden="true" />
                      <p className="ubm-empty-msg">Equipe ainda em formação.</p>
                    </div>
                  ),
              },
            ]}
          />
        </section>

        {/* ── 009: ZONA DE GESTÃO (gated por papel; colapsada; separada da leitura pública) ── */}
        {(papelAtual === 'admin' || papelAtual === 'host') && projetoId && (
          <details className="ubm-section-block ubm-gestao-zona">
            <summary className="ubm-section-title ubm-gestao-summary">Gestão da equipe</summary>
            <ProjetoDetalheClient
              projetoId={projetoId}
              indicacoes={indicacoesGrupos[0]?.indicacoes ?? []}
              papelAtual={papelAtual}
              projetoStatus={projetoStatus ?? ''}
              hostElected={hostElected}
              hostPessoaId={hostPessoaId}
              gestao={gestao}
              indicacoesAbertas={indicacoesAbertas}
              currentUserId={currentUserId}
            />
          </details>
        )}

        {/* ── 009: Indicações recebidas (coord-do-curso/admin; gate pelo RETORNO não-vazio — B2) ── */}
        {indicacoesGrupos.length > 0 && (
          <details className="ubm-section-block ubm-gestao-zona">
            <summary className="ubm-section-title ubm-gestao-summary">Indicações recebidas</summary>
            <IndicacoesRecebidas grupos={indicacoesGrupos} />
          </details>
        )}

        {/* ── 009: Funções e tarefas (membro/admin; .ubm-locked p/ não-membro — CA22) ── */}
        {projetoId && (
          <section className="ubm-section-block">
            <h2 className="ubm-section-title">Funções e tarefas</h2>
            {papelAtual ? (
              <ProjetoDetalheClient
                projetoId={projetoId}
                indicacoes={[]}
                papelAtual={papelAtual}
                projetoStatus={projetoStatus ?? ''}
                tarefas={tarefas}
                currentUserId={currentUserId}
                equipe={equipe}
                modoTarefas
              />
            ) : (
              <div className="ubm-locked">
                <span className="ubm-locked-title">Este projeto é da equipe.</span>
                <p className="ubm-locked-msg">
                  Funções e tarefas são visíveis apenas aos membros e à moderação.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── 006: Proposta e assinatura — SecaoProposta por papel (T5.4) ── */}
        {projetoId && (
          <SecaoProposta
            projetoId={projetoId}
            papel={papelProposta ?? null}
            dados={dadosProposta}
            representanteNome={representanteNome}
            representanteEmail={representanteEmail}
          />
        )}
      </div>
    </article>
  )
}
