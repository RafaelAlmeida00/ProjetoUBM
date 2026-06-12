/**
 * T-O3.4 — S2 /app/indicacoes · Auto-indicação + lista por papel (RSC)
 * design.md §S2 — aluno/coord auto-indica; coord vê só SEU curso; admin vê todas.
 * Sigilo: aluno/representante/anon = .ubm-locked (CA25/RN25).
 */

import React from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { listarProjetosVitrine, listarIndicacoes } from '@/lib/data/projetos'
import { indicarSe, retirarIndicacao } from '@/lib/actions/indicacao'
import { IndicacoesCta } from './indicacoes-client'

export default async function IndicacoesPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="ubm-shell-main">
        <div className="ubm-locked">
          <span className="ubm-locked-title">Acesso restrito</span>
          <p className="ubm-locked-msg">Faça login para acessar as indicações.</p>
        </div>
      </main>
    )
  }

  const isAdmin = !!(user.app_metadata?.is_admin)
  // P0.1 fix: usar app_metadata.roles (array) — papel_base não existe no JWT hook
  const roles = user.app_metadata?.roles as string[] | undefined
  const papelBase: 'aluno' | 'coordenador' | 'representante' =
    Array.isArray(roles) && roles.includes('coordenador') ? 'coordenador' :
    Array.isArray(roles) && roles.includes('representante') ? 'representante' :
    'aluno'
  const isVerificado = !!(user.app_metadata?.verificado || user.email_confirmed_at)

  // Representante não pode se indicar e não vê lista de indicações (CA25)
  const podeIndicar = papelBase === 'aluno' || papelBase === 'coordenador' || isAdmin
  const podeVerLista = papelBase === 'coordenador' || isAdmin

  // Projetos em em_analise (janela aberta)
  const projetos = await listarProjetosVitrine()
  const projetosAbertos = projetos.filter((p) => p.status === 'em_analise')

  // Indicações do usuário atual (para checar se já indicou)
  // Para cada projeto aberto, verifica se o usuário já tem indicação ativa
  const minhasIndicacoes = await Promise.all(
    projetosAbertos.map(async (p) => {
      try {
        const inds = await listarIndicacoes(p.id)
        const minha = inds.find((i) => i.pessoa_id === user.id && !i.deleted_at)
        return { projetoId: p.id, jaIndicado: !!minha }
      } catch {
        return { projetoId: p.id, jaIndicado: false }
      }
    })
  )

  // P1.3 fix: lista de indicações por projeto (todos os projetos abertos, não só [0])
  const indicacoesPorProjeto: Record<string, Awaited<ReturnType<typeof listarIndicacoes>>> = {}
  if (podeVerLista && projetosAbertos.length > 0) {
    await Promise.all(
      projetosAbertos.map(async (p) => {
        try {
          indicacoesPorProjeto[p.id] = await listarIndicacoes(p.id)
        } catch {
          indicacoesPorProjeto[p.id] = []
        }
      })
    )
  }

  return (
    <main className="ubm-shell-main">
      <div className="ubm-stamp-header">
        <span className="ubm-stamp-header-trail">
          <span>INDICAÇÕES</span>
        </span>
        {isAdmin && (
          <span className="ubm-navrail-mode">MODO CURADORIA</span>
        )}
      </div>

      <div className="ubm-section">
        <header className="ubm-page-header">
          <span className="ubm-cota ubm-section-kicker">
            INDICAÇÕES{podeVerLista ? (isAdmin ? ' · TODAS' : ' · SEU CURSO') : ''}
          </span>
          <h1 className="ubm-page-title">Quem entra na <em>equipe</em></h1>
          <p className="ubm-page-lead">
            {podeIndicar
              ? 'Quer ajudar a resolver uma dor real? Indique-se para um projeto aberto.'
              : 'Acompanhe quem se indicou para cada projeto em formação.'}
          </p>
        </header>

        <div className="ubm-article">
        {/* CTA de auto-indicação por projeto */}
        {podeIndicar && projetosAbertos.length > 0 && (
          <section className="ubm-section-block" aria-labelledby="indicar-heading">
            <h2 id="indicar-heading" className="ubm-section-title">Projetos disponíveis</h2>
            <div className="ubm-indicacoes-cta-stack">
              {projetosAbertos.map((projeto) => {
                const minha = minhasIndicacoes.find((m) => m.projetoId === projeto.id)
                return (
                  <IndicacoesCta
                    key={projeto.id}
                    projetoId={projeto.id}
                    papelBase={papelBase === 'coordenador' ? 'coordenador' : 'aluno'}
                    status={{
                      jaIndicado: minha?.jaIndicado ?? false,
                      verificado: isVerificado,
                      janelaAberta: true,
                    }}
                    onIndicar={indicarSe}
                    onRetirar={retirarIndicacao}
                  />
                )
              })}
            </div>
          </section>
        )}

        {/* Sigilo: aluno/representante vê peça lacrada para lista (CA25) */}
        {!podeVerLista && !isAdmin && (
          <section className="ubm-section-block">
            <div className="ubm-locked">
              <span className="ubm-cota ubm-cota--muted">RESTRITO</span>
              <span className="ubm-locked-title">As indicações são restritas</span>
              <p className="ubm-locked-msg">
                Apenas a coordenação do curso e a moderação da UBM veem quem se indicou.
              </p>
            </div>
          </section>
        )}

        {/* Lista de indicações para coord/admin — P1.3: itera todos os projetos abertos */}
        {podeVerLista && projetosAbertos.length > 0 && (
          <section className="ubm-section-block" aria-labelledby="lista-heading">
            <h2 id="lista-heading" className="ubm-section-title">
              Indicações recebidas
            </h2>
            <div className="ubm-indicacoes-projetos">
              {projetosAbertos.map((projeto) => {
                const inds = (indicacoesPorProjeto[projeto.id] ?? []).filter((ind) => !ind.deleted_at)
                return (
                  <div key={projeto.id} className="ubm-indicacoes-projeto">
                    <div className="ubm-indicacoes-projeto-head">
                      <span className="ubm-cota ubm-cota--muted">
                        PROJETO {projeto.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="ubm-indicacoes-projeto-contagem">
                        {inds.length} {inds.length === 1 ? 'indicação' : 'indicações'}
                      </span>
                    </div>
                    {inds.length === 0 ? (
                      <div className="ubm-empty">
                        <div className="ubm-empty-node" aria-hidden="true" />
                        <p className="ubm-empty-msg">Nenhuma indicação ainda neste projeto.</p>
                      </div>
                    ) : (
                      <ul className="ubm-indication-list" aria-label={`Indicações do projeto ${projeto.id.slice(0, 8)}`}>
                        {inds.map((ind) => (
                          <li key={ind.id} className="ubm-indication-row ubm-machined">
                            <span className="ubm-indication-avatar ubm-clip-node" aria-hidden="true">
                              {(ind.papel_pretendido === 'coordenador' ? 'C' : 'A')}
                            </span>
                            <span className="ubm-indication-nome">
                              {ind.aluno_nome || ind.aluno_email || ind.pessoa_id}
                              {ind.curso ? (
                                <span className="ubm-indication-curso"> · {ind.curso}</span>
                              ) : null}
                            </span>
                            <span className={`ubm-member-papel-chip ubm-member-papel-chip--${ind.papel_pretendido}`}>
                              {ind.papel_pretendido === 'coordenador' ? 'COORDENADOR' : 'ALUNO'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {isAdmin && (
                      <a
                        href={`/app/projetos/${projeto.id}`}
                        className="ubm-btn ubm-btn-secondary ubm-indicacoes-compor"
                      >
                        Compor equipe →
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
        </div>
      </div>
    </main>
  )
}
