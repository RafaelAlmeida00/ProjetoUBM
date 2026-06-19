'use client'
import { useState, useId } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { StatusDor } from './StatusDor'
import { EstagioSelo, derivarEstagioSelo } from './EstagioSelo'
import { MeIndicarSlot, type EstadoIndicacao } from './MeIndicarSlot'
import { indicarSe, retirarIndicacao } from '@/lib/actions/indicacao'
import { CURSOS_UBM } from '@/lib/courses'
import type { MeusVinculosProjeto } from '@/lib/data/projetos'

export interface DorCard {
  id: string
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
   * Vínculos do usuário (indicações ativas + membros de equipe) por projeto/dor.
   * Quando undefined → fail-safe: não renderiza botão "Me indicar".
   * Onda 2 — B6.
   */
  vinculosUsuario?: MeusVinculosProjeto
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
            aria-label={`Ver dor de ${dor.empresa_nome}`}
          >
            {dor.empresa_nome}
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

export function DoresPage({
  doresPublicadas,
  minhasDores,
  isRepresentante,
  isVerificado,
  isAutenticado = false,
  temPapel = true,
  papelUsuario,
  vinculosUsuario,
}: DoresPageProps) {
  const tabsId = useId()
  const [abaAtiva, setAbaAtiva] = useState<'vitrine' | 'minhas'>('vitrine')

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
              <div className="ubm-dor-grid">
                {doresPublicadas.map((d) => (
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
