/**
 * T-O3.7 — S3 /app/projetos/[id] · Visão da equipe + funções/tarefas + timeline compacta
 * design.md §S3 — admin fecha equipe / troca host; host avança; 006 lacrada.
 * Sigilo não-membro = .ubm-locked (CA22).
 */

import React from 'react'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  listarProjetosVitrine,
  obterEquipePublica,
  obterTimelinePublica,
  listarIndicacoes,
  listarFuncoesTarefas,
  type FuncaoTarefa,
  type Indicacao,
} from '@/lib/data/projetos'
import { UbmTimeline } from '@/components/ubm-timeline'
import { UbmTeam } from '@/components/ubm-team'
import { rotuloProjeto } from '@/lib/format/projeto'
import { ProjetoDetalheClient } from './projeto-detalhe-client'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProjetoDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Valida projeto público
  const projetos = await listarProjetosVitrine()
  const projeto = projetos.find((p) => p.id === id)
  if (!projeto) return notFound()

  const isAdmin = !!(user?.app_metadata?.is_admin)
  const userId = user?.id ?? null

  // Dados públicos (timeline + equipe via RPC)
  const [timeline, equipe] = await Promise.all([
    obterTimelinePublica(id),
    obterEquipePublica(id),
  ])

  // Verifica se usuário é membro da equipe
  // (equipe pública retorna papel — checamos se userId aparece como host)
  // Para verificar membro autenticado, buscamos tarefas (RLS filtra por membro)
  let isMembro = false
  let isHost = false
  let tarefas: FuncaoTarefa[] = []
  let indicacoes: Indicacao[] = []

  if (userId) {
    // Verifica se é host (deve vir antes de isMembro para usar na derivação)
    const hostId = (projeto as { host_coordenador_id?: string }).host_coordenador_id ?? null
    isHost = !!userId && hostId === userId

    // Busca tarefas (catch→[] por design — listarFuncoesTarefas nunca lança)
    tarefas = await listarFuncoesTarefas(id)

    // P1.2 fix: isMembro derivado de tarefas retornadas (RLS), host ou admin
    // Tarefas só retornam para membros via RLS — se length>0, é membro.
    isMembro = isAdmin || isHost || tarefas.length > 0

    // Admin e coord podem ver indicações
    if (isAdmin) {
      try {
        indicacoes = await listarIndicacoes(id)
      } catch {
        indicacoes = []
      }
    }
  }

  const semEquipe = projeto.status === 'em_analise' && equipe.length === 0
  const papelAtual = isAdmin ? 'admin' : isHost ? 'host' : isMembro ? 'aluno' : null

  const statusLabel = projeto.status.replace(/_/g, ' ').toUpperCase()
  const rotulo = rotuloProjeto(projeto.titulo, projeto.empresa_nome)

  return (
    <main className="ubm-shell-main">
      <div className="ubm-stamp-header">
        <span className="ubm-stamp-header-trail">
          <span>PROJETO</span>
          <b>·</b>
          <span className="ubm-cota">{statusLabel}</span>
        </span>
        {isAdmin && (
          <span className="ubm-navrail-mode">MODO CURADORIA</span>
        )}
      </div>

      <div className="ubm-section">
        <div aria-live="polite" aria-atomic="true" id="projeto-status-live" />

        {/* Cabeçalho institucional do projeto */}
        <header className="ubm-page-header">
          <span className="ubm-cota ubm-section-kicker">SALA DA EQUIPE · {statusLabel}</span>
          <h1 className="ubm-page-title">{rotulo}</h1>
          <p className="ubm-page-lead">
            Aqui a equipe se organiza: quem está dentro, o que cada um faz e como
            o trabalho avança — etapa por etapa.
          </p>
        </header>

        <div className="ubm-article">
          {/* Equipe */}
          <section className="ubm-section-block" aria-labelledby="equipe-heading">
            <h2 id="equipe-heading" className="ubm-section-title">Equipe</h2>
            {semEquipe ? (
              <div className="ubm-detalhe-stack">
                <p className="ubm-cota ubm-cota--muted">Equipe ainda não formada.</p>
                {isAdmin && (
                  <ProjetoDetalheClient
                    projetoId={id}
                    indicacoes={indicacoes}
                    papelAtual="admin"
                    projetoStatus={projeto.status}
                  />
                )}
              </div>
            ) : (
              <div className="ubm-detalhe-stack">
                <UbmTeam membros={equipe} />
                {/* Ações do host */}
                {isHost && projeto.status === 'aprovado' && (
                  <ProjetoDetalheClient
                    projetoId={id}
                    indicacoes={[]}
                    papelAtual="host"
                    projetoStatus={projeto.status}
                  />
                )}
                {/* Ações do admin */}
                {isAdmin && (
                  <ProjetoDetalheClient
                    projetoId={id}
                    indicacoes={indicacoes}
                    papelAtual="admin"
                    projetoStatus={projeto.status}
                  />
                )}
              </div>
            )}
          </section>

          {/* Funções e tarefas — privado para membros/admin (CA22) */}
          <section className="ubm-section-block" aria-labelledby="tarefas-heading">
            <h2 id="tarefas-heading" className="ubm-section-title">Funções e tarefas</h2>
            {!isMembro && !isAdmin ? (
              <div className="ubm-locked">
                <span className="ubm-locked-title">Este projeto é da equipe.</span>
                <p className="ubm-locked-msg">
                  Funções e tarefas são visíveis apenas aos membros e à moderação.
                </p>
              </div>
            ) : (
              <ProjetoDetalheClient
                projetoId={id}
                indicacoes={[]}
                papelAtual={papelAtual}
                projetoStatus={projeto.status}
                tarefas={tarefas}
                currentUserId={userId}
                equipe={equipe}
                modoTarefas
              />
            )}
          </section>

          {/* Linha do tempo compacta */}
          <section className="ubm-section-block" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="ubm-section-title">Linha do tempo</h2>
            <UbmTimeline eventos={timeline} compacto />
          </section>

          {/* Peça lacrada 006 */}
          <section className="ubm-section-block">
            <div className="ubm-locked" aria-label="Próximas etapas em breve">
              <span className="ubm-cota ubm-cota--muted">EM BREVE · 006</span>
              <span className="ubm-locked-title">Proposta e assinatura</span>
              <p className="ubm-locked-msg">
                Proposta e assinatura aparecerão aqui quando a equipe avançar.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
