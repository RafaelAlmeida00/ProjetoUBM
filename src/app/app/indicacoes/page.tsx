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
  const papelBase = (user.app_metadata?.papel_base as 'aluno' | 'coordenador' | 'representante' | undefined) ?? 'aluno'
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

  // Lista de indicações para coord/admin
  const todasIndicacoes = podeVerLista && projetosAbertos.length > 0
    ? await listarIndicacoes(projetosAbertos[0]?.id ?? '')
    : []

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
        <h1 className="font-display" style={{ fontSize: 'clamp(1.6rem,4vw,2.2rem)', marginBottom: '0.5rem' }}>
          Indicações
        </h1>
        <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '2rem' }}>
          Quer ajudar a resolver esta dor? Indique-se.
        </p>

        {/* CTA de auto-indicação por projeto */}
        {podeIndicar && projetosAbertos.length > 0 && (
          <section aria-labelledby="indicar-heading">
            <h2 id="indicar-heading" className="ubm-cota" style={{ marginBottom: '1rem' }}>
              PROJETOS DISPONÍVEIS
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
          <div className="ubm-locked" style={{ marginTop: '2rem' }}>
            <span className="ubm-locked-title">As indicações são restritas</span>
            <p className="ubm-locked-msg">
              Apenas a coordenação do curso e a moderação da UBM veem quem se indicou.
            </p>
          </div>
        )}

        {/* Lista de indicações para coord/admin */}
        {podeVerLista && (
          <section aria-labelledby="lista-heading" style={{ marginTop: '2rem' }}>
            <h2 id="lista-heading" className="ubm-cota" style={{ marginBottom: '1rem' }}>
              INDICAÇÕES {isAdmin ? '(TODAS)' : '(SEU CURSO)'}
            </h2>
            {todasIndicacoes.length === 0 ? (
              <div className="ubm-empty">
                <div className="ubm-empty-node" aria-hidden="true" />
                <p className="ubm-empty-msg">Nenhuma indicação ainda neste projeto.</p>
              </div>
            ) : (
              <ul className="ubm-indication-list" aria-label="Lista de indicações">
                {todasIndicacoes
                  .filter((ind) => !ind.deleted_at)
                  .map((ind) => (
                    <li key={ind.id} className="ubm-indication-row ubm-machined">
                      <span className="ubm-indication-nome">
                        {ind.pessoa_id}
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
                href={projetosAbertos[0] ? `/app/projetos/${projetosAbertos[0].id}` : '#'}
                className="ubm-btn ubm-btn-secondary"
                style={{ marginTop: '1rem', display: 'inline-flex' }}
              >
                Compor equipe
              </a>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
