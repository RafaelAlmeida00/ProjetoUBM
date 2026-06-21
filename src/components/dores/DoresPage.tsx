'use client'
import { useState, useId, useMemo } from 'react'
import Link from 'next/link'
import { Lock, X } from 'lucide-react'
import { StatusDor } from './StatusDor'
import { EstagioSelo, derivarEstagioSelo } from './EstagioSelo'
import { MeIndicarSlot, type EstadoIndicacao } from './MeIndicarSlot'
import { IndicacoesRecebidas, type GrupoIndicacoes } from '@/components/indicacoes/IndicacoesRecebidas'
import { indicarSe, retirarIndicacao } from '@/lib/actions/indicacao'
import { CURSOS_UBM } from '@/lib/courses'
import { rotuloProjeto } from '@/lib/format/projeto'
import type { MeusVinculosProjeto } from '@/lib/data/projetos'

export interface DorCard {
  id: string
  titulo?: string | null
  empresa_nome: string
  descricao: string
  status: 'rascunho' | 'em_moderacao' | 'publicada' | 'rejeitada'
  cursos: string[]
  publicada_em?: string | null
  criada_em?: string | null
  aprovado_por?: string | null
  /** Status do projeto associado via uq_projeto_dor (ADR-0002 — selo de estágio).
   *  undefined = dor publicada sem projeto ainda (sem selo).
   *  "finalizado" = projeto encerrado (selo marsala).
   *  qualquer outro = projeto ativo (selo azul "VIROU CASO"). */
  projeto_status?: string
  /** ID do projeto associado (uq_projeto_dor). É a CHAVE da indicação (indicar_se/retirar
   *  e vínculos operam por projeto_id, não por dor_id). undefined = dor sem projeto ainda. */
  projeto_id?: string
}

interface DoresPageProps {
  doresPublicadas: DorCard[]
  minhasDores: DorCard[]
  isRepresentante: boolean
  isVerificado: boolean
  /** true quando o usuário está autenticado (com ou sem papel). Usado para mostrar
   *  o CTA de onboarding quando o usuário está logado mas ainda não concluiu o cadastro.
   *  Padrão false (retro-compatível). */
  isAutenticado?: boolean
  /** true quando o usuário já tem ao menos um papel (aluno, coordenador, representante).
   *  Quando false + isAutenticado=true: usuário logado sem nenhum papel → mostra CTA de onboarding.
   *  Padrão true (safe default: não naguear usuários onboardados quando prop não é passada). */
  temPapel?: boolean
  /**
   * Papel do usuário corrente para derivar estado do MeIndicarSlot.
   * Quando undefined → fail-safe: não renderiza botão "Me indicar".
   * Onda 2 — B6.
   */
  papelUsuario?: 'aluno' | 'coordenador' | 'representante'
  /**
   * Vínculos do usuário (indicações ativas + membros de equipe + host) por projeto.
   * Quando undefined → fail-safe: não renderiza botão "Me indicar" nem filtro Participação.
   * Onda 2 — B6. 009: estendido com hostProjetoIds.
   */
  vinculosUsuario?: MeusVinculosProjeto
  /**
   * 009 — Cursos que o coordenador coordena (slugs como em curso_ubm).
   * Passado pelo RSC apenas quando papelUsuario === 'coordenador'.
   * Vazio ou undefined → opção "Minha Coordenação" não é renderizada (evita opção morta).
   */
  cursosCoordenacao?: string[]
  /**
   * 009 T18 — grupos de "Indicações recebidas" AGREGADOS dos projetos abertos, JÁ buscados e
   * gated pelo RSC (admin/coord-aprovado; PII só chega aqui se autorizado). Vazio/undefined →
   * a seção não aparece (display por retorno, CA15). Renderizada colapsada acima da vitrine.
   */
  indicacoesAgregadas?: GrupoIndicacoes[]
}

function labelCurso(value: string): string {
  return CURSOS_UBM.find((c) => c.value === value)?.label ?? value
}

/**
 * Onda 2 B6: card refatorado — article + link-no-título (stretched-link overlay).
 * Resolve nesting inválido <a><button> do design anterior.
 * MeIndicarSlot fica na .ubm-card-action-row (z-index acima do overlay via CSS).
 * Fail-safe: sem estadoIndicacao → slot não renderizado.
 */
function DorCardItem({
  dor,
  minha,
  estadoIndicacao,
  papelBase,
}: {
  dor: DorCard
  minha?: boolean
  estadoIndicacao?: EstadoIndicacao
  papelBase?: 'aluno' | 'coordenador'
}) {
  const data = dor.publicada_em ?? dor.criada_em
  // Selo de estágio só para dor publicada. em_analise/sem-projeto → undefined (indicação aberta).
  const estagio = dor.status === 'publicada' ? derivarEstagioSelo(dor.projeto_status) : undefined
  // Selo × botão são MUTUAMENTE EXCLUSIVOS: enquanto a indicação está aberta (sem selo),
  // só o botão "Me indicar" aparece; quando o projeto avança (aprovado+/finalizado → tem selo),
  // a janela de indicação fecha (RN9: backend nega indicar fora de em_analise) → só o selo aparece.
  const indicacaoAberta = !estagio
  return (
    <article className={`ubm-dor-card ubm-dor-card--linkable${minha ? ' ubm-dor-card--dor' : ''}`}>
      <div className="ubm-dor-card-head">
        <h3 className="ubm-dor-card-empresa">
          <a
            href={`/app/dores/${dor.id}`}
            className="ubm-dor-card-link"
            aria-label={`Ver ${rotuloProjeto(dor.titulo, dor.empresa_nome)}`}
          >
            {rotuloProjeto(dor.titulo, dor.empresa_nome)}
          </a>
        </h3>
        <StatusDor
          status={dor.status}
          aprovadoPor={dor.aprovado_por}
          pulso={dor.status === 'em_moderacao' && !dor.aprovado_por}
        />
      </div>
      <p className="ubm-dor-card-desc">{dor.descricao}</p>
      {dor.cursos.length > 0 && (
        <div className="ubm-dor-card-cursos">
          {dor.cursos.map((c) => (
            <span key={c} className="ubm-dor-card-curso">{labelCurso(c)}</span>
          ))}
        </div>
      )}
      <div className="ubm-dor-card-foot ubm-card-action-row">
        <span className="ubm-cota ubm-cota--muted">
          {data ? new Date(data).toLocaleDateString('pt-BR') : '—'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative', zIndex: 1 }}>
          {/* Selo de estágio (ADR-0002 Q1) — só pós-indicação (aprovado+/finalizado) */}
          {estagio && <EstagioSelo estagio={estagio} />}
          {/* Slot "Me indicar" — só com indicação aberta (em_analise), projeto_id presente e papel/estado disponíveis (fail-safe) */}
          {indicacaoAberta && estadoIndicacao && papelBase && dor.projeto_id && (
            <MeIndicarSlot
              projetoId={dor.projeto_id}
              empresaNome={dor.empresa_nome}
              papelBase={papelBase}
              estado={estadoIndicacao}
              onIndicar={indicarSe}
              onRetirar={retirarIndicacao}
            />
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * T7 — /app/dores: vitrine de dores publicadas + minhas dores.
 * Tabs WAI-ARIA; aba "Minhas dores" só para representante.
 *
 * B-003 task #3: isAutenticado controla o CTA de onboarding para
 * usuários logados sem papel (RN21/CA27/CA28).
 */
/**
 * Deriva o estado do slot "Me indicar" para uma dor a partir dos vínculos do usuário.
 * Retorna undefined quando o papel não deve ver o botão (representante, ou props ausentes).
 */
function derivarEstadoIndicacao(
  projetoId: string | undefined,
  papelBase: 'aluno' | 'coordenador' | 'representante' | undefined,
  vinculosUsuario: MeusVinculosProjeto | undefined,
  coordAprovado: boolean,
): EstadoIndicacao | undefined {
  // representante não se indica; sem papel/vínculos/projeto → fail-safe.
  // projetoId é a chave real (indicacao + membro_equipe são keyed por projeto_id) — sem ele
  // não há o que indicar (e era a causa do bug: comparávamos dor_id contra projeto_ids).
  if (!papelBase || papelBase === 'representante' || !vinculosUsuario || !projetoId) return undefined

  // coordenador pendente (aprovação necessária, mas ainda não aprovado)
  if (papelBase === 'coordenador' && !coordAprovado) return 'coord_pendente'

  if (vinculosUsuario.membroProjetoIds.includes(projetoId)) return 'ja_membro'
  if (vinculosUsuario.indicadoProjetoIds.includes(projetoId)) return 'ja_indicado'
  return 'disponivel'
}

// ─────────────────────────────────────────────────────────────────────────────
// 009 — Tipos para o estado dos filtros
// ─────────────────────────────────────────────────────────────────────────────

type FiltroAndamento = '' | 'publicada' | 'em_analise' | 'caso' | 'finalizado'
type FiltroParticipacao = '' | 'indicado' | 'nao_indicado' | 'membro' | 'host'

interface EstadoFiltros {
  curso: string        // '' = Todos, '__minha_coord__' = Minha Coordenação, ou slug
  empresa: string      // '' = Todas, ou nome exato
  andamento: FiltroAndamento
  participacao: FiltroParticipacao
}

const FILTROS_VAZIO: EstadoFiltros = { curso: '', empresa: '', andamento: '', participacao: '' }

// ─────────────────────────────────────────────────────────────────────────────
// 009 — Barra de filtros (componente interno)
// ─────────────────────────────────────────────────────────────────────────────

interface BarraFiltrosProps {
  dores: DorCard[]
  papelUsuario?: 'aluno' | 'coordenador' | 'representante'
  vinculosUsuario?: MeusVinculosProjeto
  cursosCoordenacao?: string[]
  filtros: EstadoFiltros
  onFiltroChange: (parcial: Partial<EstadoFiltros>) => void
  onLimpar: () => void
  totalFiltrado: number
}

function BarraFiltros({
  dores,
  papelUsuario,
  vinculosUsuario,
  cursosCoordenacao,
  filtros,
  onFiltroChange,
  onLimpar,
  totalFiltrado,
}: BarraFiltrosProps) {
  // Opções derivadas das dores presentes (evita opções sem resultado garantido)
  const cursosDistintos = useMemo(() => {
    const vals = Array.from(new Set(dores.flatMap((d) => d.cursos)))
    return vals
      .map((v) => ({ value: v, label: CURSOS_UBM.find((c) => c.value === v)?.label ?? v }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [dores])

  const empresasDistintas = useMemo(() => {
    return Array.from(new Set(dores.map((d) => d.empresa_nome))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    )
  }, [dores])

  // Filtro Participação: oculto para representante ou sem vinculosUsuario
  const mostrarParticipacao =
    papelUsuario !== 'representante' && !!vinculosUsuario && papelUsuario !== undefined

  const isCoord = papelUsuario === 'coordenador'
  const temCursoCoord = isCoord && !!cursosCoordenacao && cursosCoordenacao.length > 0

  // Quais filtros estão ativos
  const filtrosAtivos = Object.entries(filtros).filter(([, v]) => v !== '') as [
    keyof EstadoFiltros,
    string,
  ][]
  const temFiltroAtivo = filtrosAtivos.length > 0

  // Rótulos legíveis para chips
  const rotulosDimensao: Record<keyof EstadoFiltros, string> = {
    curso: 'CURSO',
    empresa: 'EMPRESA',
    andamento: 'ANDAMENTO',
    participacao: 'PARTICIPAÇÃO',
  }

  function labelValorFiltro(dim: keyof EstadoFiltros, valor: string): string {
    if (dim === 'curso') {
      if (valor === '__minha_coord__') return 'Minha Coordenação'
      return CURSOS_UBM.find((c) => c.value === valor)?.label ?? valor
    }
    if (dim === 'andamento') {
      const mapa: Record<string, string> = {
        publicada: 'Publicada',
        em_analise: 'Em análise',
        caso: 'Virou caso',
        finalizado: 'Finalizado',
      }
      return mapa[valor] ?? valor
    }
    if (dim === 'participacao') {
      const mapa: Record<string, string> = {
        indicado: 'Indicado',
        nao_indicado: 'Não indicado',
        membro: 'Membro',
        host: 'Host',
      }
      return mapa[valor] ?? valor
    }
    return valor
  }

  const totalLabel = totalFiltrado === 1 ? '1 dor' : `${totalFiltrado} dores`

  return (
    <>
      <div className="ubm-filtros">
        <span className="ubm-filtros-titulo" aria-hidden>
          FILTRAR
        </span>
        <div className="ubm-filtros-campos">
          {/* ── Curso ── */}
          <label className="ubm-filtro-campo">
            <span className="ubm-filtro-cota">CURSO</span>
            <select
              className="ubm-filtro-select"
              aria-label="Filtrar por curso"
              value={filtros.curso}
              data-ativo={filtros.curso !== '' ? 'true' : undefined}
              onChange={(e) => onFiltroChange({ curso: e.target.value })}
            >
              <option value="">Todos</option>
              {temCursoCoord && (
                <option value="__minha_coord__">Minha Coordenação</option>
              )}
              {cursosDistintos.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {/* ── Empresa ── */}
          <label className="ubm-filtro-campo">
            <span className="ubm-filtro-cota">EMPRESA</span>
            <select
              className="ubm-filtro-select"
              aria-label="Filtrar por empresa"
              value={filtros.empresa}
              data-ativo={filtros.empresa !== '' ? 'true' : undefined}
              onChange={(e) => onFiltroChange({ empresa: e.target.value })}
            >
              <option value="">Todas</option>
              {empresasDistintas.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>

          {/* ── Andamento ── */}
          <label className="ubm-filtro-campo">
            <span className="ubm-filtro-cota">ANDAMENTO</span>
            <select
              className="ubm-filtro-select"
              aria-label="Filtrar por andamento"
              value={filtros.andamento}
              data-ativo={filtros.andamento !== '' ? 'true' : undefined}
              onChange={(e) =>
                onFiltroChange({ andamento: e.target.value as FiltroAndamento })
              }
            >
              <option value="">Todos</option>
              <option value="publicada">Publicada</option>
              <option value="em_analise">Em análise</option>
              <option value="caso">Virou caso</option>
              <option value="finalizado">Finalizado</option>
            </select>
          </label>

          {/* ── Participação (oculto para representante / sem vínculos) ── */}
          {mostrarParticipacao && (
            <label className="ubm-filtro-campo">
              <span className="ubm-filtro-cota">PARTICIPAÇÃO</span>
              <select
                className="ubm-filtro-select"
                aria-label="Filtrar por participação"
                value={filtros.participacao}
                data-ativo={filtros.participacao !== '' ? 'true' : undefined}
                onChange={(e) =>
                  onFiltroChange({ participacao: e.target.value as FiltroParticipacao })
                }
              >
                <option value="">Todos</option>
                <option value="indicado">Indicado</option>
                <option value="nao_indicado">Não indicado</option>
                <option value="membro">Membro</option>
                {isCoord && <option value="host">Host</option>}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* ── Linha de resultado: contagem + chips + limpar ── */}
      <div
        className="ubm-filtros-resultado"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="ubm-filtros-contagem">
          <b>{totalFiltrado}</b> {totalFiltrado === 1 ? 'dor' : 'dores'}
        </span>

        {filtrosAtivos.map(([dim, valor]) => (
          <span key={dim} className="ubm-filtro-chip">
            <span className="ubm-filtro-chip-rotulo">{rotulosDimensao[dim]}</span>
            {' '}{labelValorFiltro(dim, valor)}
            <button
              type="button"
              className="ubm-filtro-chip-x"
              aria-label={`Remover filtro de ${rotulosDimensao[dim].toLowerCase()}`}
              onClick={() => onFiltroChange({ [dim]: '' } as Partial<EstadoFiltros>)}
            >
              <X aria-hidden />
            </button>
          </span>
        ))}

        {temFiltroAtivo && (
          <button
            type="button"
            className="ubm-filtros-limpar"
            onClick={onLimpar}
            aria-label="Limpar filtros"
          >
            <X aria-hidden />
            Limpar filtros
          </button>
        )}

        {/* Acessível mas invisível quando sem filtro — só para screen readers */}
        {!temFiltroAtivo && (
          <span className="sr-only">{totalLabel}</span>
        )}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lógica de filtragem client-side (AND entre dimensões)
// ─────────────────────────────────────────────────────────────────────────────

function filtrarDores(
  dores: DorCard[],
  filtros: EstadoFiltros,
  vinculosUsuario: MeusVinculosProjeto | undefined,
  cursosCoordenacao: string[] | undefined,
): DorCard[] {
  return dores.filter((d) => {
    // ── Curso ──
    if (filtros.curso !== '') {
      if (filtros.curso === '__minha_coord__') {
        const cursos = cursosCoordenacao ?? []
        if (!d.cursos.some((c) => cursos.includes(c))) return false
      } else {
        if (!d.cursos.includes(filtros.curso)) return false
      }
    }

    // ── Empresa ──
    if (filtros.empresa !== '' && d.empresa_nome !== filtros.empresa) return false

    // ── Andamento (alinhado a derivarEstagioSelo) ──
    if (filtros.andamento !== '') {
      const estagio = derivarEstagioSelo(d.projeto_status)
      switch (filtros.andamento) {
        case 'publicada':
          if (!(!d.projeto_id && d.status === 'publicada')) return false
          break
        case 'em_analise':
          if (d.projeto_status !== 'em_analise') return false
          break
        case 'caso':
          if (estagio !== 'caso') return false
          break
        case 'finalizado':
          if (estagio !== 'finalizado') return false
          break
      }
    }

    // ── Participação ──
    if (filtros.participacao !== '' && vinculosUsuario) {
      const pid = d.projeto_id
      switch (filtros.participacao) {
        case 'indicado':
          if (!pid || !vinculosUsuario.indicadoProjetoIds.includes(pid)) return false
          break
        case 'membro':
          if (!pid || !vinculosUsuario.membroProjetoIds.includes(pid)) return false
          break
        case 'host':
          if (!pid || !vinculosUsuario.hostProjetoIds.includes(pid)) return false
          break
        case 'nao_indicado':
          // Dor em janela de indicação (em_analise) e usuário NÃO indicado/membro
          if (d.projeto_status !== 'em_analise') return false
          if (!pid) return false
          if (vinculosUsuario.indicadoProjetoIds.includes(pid)) return false
          if (vinculosUsuario.membroProjetoIds.includes(pid)) return false
          break
      }
    }

    return true
  })
}

export function DoresPage({
  doresPublicadas,
  minhasDores,
  isRepresentante,
  isVerificado,
  isAutenticado = false,
  temPapel = true,
  papelUsuario,
  vinculosUsuario,
  cursosCoordenacao,
  indicacoesAgregadas,
}: DoresPageProps) {
  const tabsId = useId()
  const [abaAtiva, setAbaAtiva] = useState<'vitrine' | 'minhas'>('vitrine')
  const [filtros, setFiltros] = useState<EstadoFiltros>(FILTROS_VAZIO)

  const vitrineId = `${tabsId}-vitrine`
  const minhasId = `${tabsId}-minhas`
  const painelId = `${tabsId}-painel`

  // Usuário autenticado mas sem NENHUM papel ainda (onboarding não concluído).
  // Usa temPapel quando disponível; sem a prop (retro-compat), safe default = true
  // (não naguear aluno/coord que não passam a prop).
  const semPapel = isAutenticado && !temPapel

  // papelBase: só aluno e coordenador têm slot de indicação (representante não se indica).
  const papelBase: 'aluno' | 'coordenador' | undefined =
    papelUsuario === 'aluno' || papelUsuario === 'coordenador' ? papelUsuario : undefined

  // coordAprovado: só relevante para coordenador — passa false como safe default
  // (o RSC deve injetar o valor real via prop; se ausente, coord será tratado como pendente)
  // A prop não existe ainda; derivamos a partir de vinculosUsuario === undefined
  // → coord sem vinculosUsuario = fail-safe (sem slot) por derivarEstadoIndicacao.
  const coordAprovado = papelUsuario === 'coordenador' && !!vinculosUsuario

  // 009 — Dores filtradas (client-side, AND entre dimensões)
  const doresFiltradas = useMemo(
    () => filtrarDores(doresPublicadas, filtros, vinculosUsuario, cursosCoordenacao),
    [doresPublicadas, filtros, vinculosUsuario, cursosCoordenacao],
  )

  function handleFiltroChange(parcial: Partial<EstadoFiltros>) {
    setFiltros((prev) => ({ ...prev, ...parcial }))
  }

  function handleLimparFiltros() {
    setFiltros(FILTROS_VAZIO)
  }

  return (
    <section className="ubm-section">
      <div className="ubm-stamp-header" style={{ marginBottom: '1.5rem' }}>
        <div className="ubm-stamp-header-trail">
          <span>APP</span>
          <span>/</span>
          <b>DORES</b>
        </div>
        <div className="ubm-stamp-header-actions">
          {isRepresentante && isVerificado && (
            <Link href="/app/dores/nova" className="ubm-btn ubm-btn-primary" style={{ height: '2.5rem', fontSize: '0.88rem' }}>
              Propor nova dor
            </Link>
          )}
          {isRepresentante && !isVerificado && (
            <div className="ubm-locked" style={{ padding: '0.5rem 1rem', flexDirection: 'row', gap: '0.5rem' }}>
              <Lock size={14} aria-hidden className="ubm-locked-icon" style={{ width: '1rem', height: '1rem' }} />
              <span className="ubm-locked-msg" style={{ fontSize: '0.85rem' }}>
                Verifique sua conta para criar dores
              </span>
            </div>
          )}
          {semPapel && (
            <Link
              href="/app/onboarding"
              className="ubm-btn ubm-btn-secondary"
              style={{ height: '2.5rem', fontSize: '0.88rem' }}
            >
              Complete seu cadastro
            </Link>
          )}
        </div>
      </div>

      {/* 009 T18 — seção agregada "Indicações recebidas" (coord-do-curso/admin), colapsada por
          padrão (accordion ubm-gestao-zona, igual à zona de gestão do detalhe). Só renderiza com
          ≥1 grupo (display por retorno). PII já autorizada pelo RSC. */}
      {indicacoesAgregadas && indicacoesAgregadas.length > 0 && (
        <details className="ubm-section-block ubm-gestao-zona" style={{ marginBottom: '1.5rem' }}>
          <summary className="ubm-section-title ubm-gestao-summary">Indicações recebidas</summary>
          <IndicacoesRecebidas grupos={indicacoesAgregadas} />
        </details>
      )}

      {/* Tabs WAI-ARIA */}
      <div role="tablist" aria-label="Visualização de dores" className="ubm-tablist">
        <button
          id={vitrineId}
          role="tab"
          aria-selected={abaAtiva === 'vitrine'}
          aria-controls={painelId}
          className={`ubm-btn ubm-btn-ghost${abaAtiva === 'vitrine' ? ' is-active' : ''}`}
          onClick={() => setAbaAtiva('vitrine')}
          tabIndex={abaAtiva === 'vitrine' ? 0 : -1}
        >
          Vitrine
        </button>
        {isRepresentante && (
          <button
            id={minhasId}
            role="tab"
            aria-selected={abaAtiva === 'minhas'}
            aria-controls={painelId}
            className={`ubm-btn ubm-btn-ghost${abaAtiva === 'minhas' ? ' is-active' : ''}`}
            onClick={() => setAbaAtiva('minhas')}
            tabIndex={abaAtiva === 'minhas' ? 0 : -1}
          >
            Minhas dores
          </button>
        )}
      </div>

      {/* Painel */}
      <div
        id={painelId}
        role="tabpanel"
        aria-labelledby={abaAtiva === 'vitrine' ? vitrineId : minhasId}
        style={{ marginTop: '1.25rem' }}
      >
        {abaAtiva === 'vitrine' && (
          <>
            {doresPublicadas.length === 0 ? (
              <div className="ubm-empty">
                <div className="ubm-empty-node" aria-hidden />
                <p className="ubm-empty-title">Ainda não há dores publicadas.</p>
                <p className="ubm-empty-msg">
                  {semPapel ? (
                    <>
                      Para propor sua própria dor,{' '}
                      <Link href="/app/onboarding" className="ubm-link">
                        complete seu cadastro
                      </Link>{' '}
                      e escolha seu papel.
                    </>
                  ) : isRepresentante ? (
                    'Seja o primeiro a propor uma dor.'
                  ) : (
                    'Conheça como funciona a plataforma.'
                  )}
                </p>
              </div>
            ) : (
              <>
                {/* 009 — Barra de filtros (só quando há dores) */}
                <BarraFiltros
                  dores={doresPublicadas}
                  papelUsuario={papelUsuario}
                  vinculosUsuario={vinculosUsuario}
                  cursosCoordenacao={cursosCoordenacao}
                  filtros={filtros}
                  onFiltroChange={handleFiltroChange}
                  onLimpar={handleLimparFiltros}
                  totalFiltrado={doresFiltradas.length}
                />

                {/* Grade ou empty-state de filtros */}
                {doresFiltradas.length === 0 ? (
                  <div className="ubm-empty ubm-empty--filtros">
                    <div className="ubm-empty-node" aria-hidden />
                    <p className="ubm-empty-title">Nenhuma dor com esses filtros</p>
                    <p className="ubm-empty-msg">
                      Ajuste ou limpe os filtros para ver outras dores publicadas.
                    </p>
                    <button
                      type="button"
                      className="ubm-btn ubm-btn-secondary ubm-empty-limpar"
                      onClick={handleLimparFiltros}
                    >
                      Limpar filtros
                    </button>
                  </div>
                ) : (
                  <div className="ubm-dor-grid">
                    {doresFiltradas.map((d) => (
                      <DorCardItem
                        key={d.id}
                        dor={d}
                        estadoIndicacao={derivarEstadoIndicacao(d.projeto_id, papelUsuario, vinculosUsuario, coordAprovado)}
                        papelBase={papelBase}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {abaAtiva === 'minhas' && (
          <>
            {minhasDores.length === 0 ? (
              <div className="ubm-empty">
                <div className="ubm-empty-node" aria-hidden />
                <p className="ubm-empty-title">Você ainda não criou nenhuma dor.</p>
                <p className="ubm-empty-msg">
                  <Link href="/app/dores/nova" className="ubm-link">Propor minha primeira dor</Link>
                </p>
              </div>
            ) : (
              <div className="ubm-dor-grid">
                {minhasDores.map((d) => (
                  <DorCardItem key={d.id} dor={d} minha />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
