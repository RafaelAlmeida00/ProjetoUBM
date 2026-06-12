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
} from '@/lib/data/projetos'
import { UbmTimeline } from '@/components/ubm-timeline'
import { UbmTeam } from '@/components/ubm-team'
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
  let tarefas = []
  let indicacoes = []

  if (userId) {
    // Tentativa de ler tarefas (RLS permite só membros/admin)
    try {
      tarefas = await listarFuncoesTarefas(id)
      isMembro = true // Se RLS passou, é membro ou admin
    } catch {
      isMembro = false
    }

    // Admin e coord podem ver indicações
    if (isAdmin) {
      try {
        indicacoes = await listarIndicacoes(id)
      } catch {
        indicacoes = []
      }
    }

    // Verifica se é host (host_coordenador_id no projeto)
    // C1 fix (G4): precedência de !! era maior que === → comparava boolean com string e dava sempre false.
    const hostId = (projeto as { host_coordenador_id?: string }).host_coordenador_id ?? null
    isHost = !!userId && hostId === userId
  }

  const semEquipe = projeto.status === 'em_analise' && equipe.length === 0
  const papelAtual = isAdmin ? 'admin' : isHost ? 'host' : isMembro ? 'aluno' : null

  return (
    <main className="ubm-shell-main">
      <div className="ubm-stamp-header">
        <span className="ubm-stamp-header-trail">
          <span>PROJETO</span>
          <b>·</b>
          <span className="ubm-cota">{projeto.status.replace(/_/g, ' ').toUpperCase()}</span>
        </span>
        {isAdmin && (
          <span className="ubm-navrail-mode">MODO CURADORIA</span>
        )}
      </div>

      <div className="ubm-section">
        <div aria-live="polite" aria-atomic="true" id="projeto-status-live" />

        {/* Equipe */}
        <section aria-labelledby="equipe-heading" style={{ marginBottom: '2rem' }}>
          <h2 id="equipe-heading" className="ubm-cota" style={{ marginBottom: '1rem' }}>
            EQUIPE
          </h2>
          {semEquipe ? (
            <div>
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
            <>
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
            </>
          )}
        </section>

        {/* Tarefas — privado para membros/admin (CA22) */}
        <section aria-labelledby="tarefas-heading" style={{ marginBottom: '2rem' }}>
          <h2 id="tarefas-heading" className="ubm-cota" style={{ marginBottom: '1rem' }}>
            FUNÇÕES E TAREFAS
          </h2>
          {!isMembro && !isAdmin ? (
            <div className="ubm-locked">
              <span className="ubm-locked-title">Este projeto é da equipe.</span>
              <p className="ubm-locked-msg">
                Funções e tarefas são visíveis apenas aos membros e à moderação.
              </p>
            </div>
          ) : tarefas.length === 0 ? (
            <div className="ubm-empty">
              <div className="ubm-empty-node" aria-hidden="true" />
              <p className="ubm-empty-msg">Nenhuma tarefa ainda. Organize o trabalho da equipe.</p>
            </div>
          ) : (
            <ul aria-label="Tarefas do projeto">
              {tarefas.map((t) => (
                <li key={t.id} className="ubm-task ubm-machined">
                  <span className="ubm-task-titulo">{t.titulo}</span>
                  {t.responsavel_id !== userId && papelAtual === 'aluno' && (
                    <span className="ubm-cota ubm-cota--muted">DE OUTRO MEMBRO</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Timeline compacta */}
        <section aria-labelledby="timeline-heading" style={{ marginBottom: '2rem' }}>
          <h2 id="timeline-heading" className="ubm-cota" style={{ marginBottom: '1rem' }}>
            LINHA DO TEMPO
          </h2>
          <UbmTimeline eventos={timeline} compacto />
        </section>

        {/* Peça lacrada 006 */}
        <div className="ubm-locked" style={{ marginTop: '2rem' }} aria-label="Próximas etapas em breve">
          <span className="ubm-locked-title">Proposta e assinatura</span>
          <p className="ubm-locked-msg">
            Proposta e assinatura aparecerão aqui quando a equipe avançar — em breve.
          </p>
          <span className="ubm-cota ubm-cota--muted">EM BREVE (006)</span>
        </div>
      </div>
    </main>
  )
}
