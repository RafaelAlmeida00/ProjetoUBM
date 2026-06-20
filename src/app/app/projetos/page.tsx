/**
 * /app/projetos — lista de projetos (porta de entrada para a Sala da equipe).
 * Faltava: só existia /app/projetos/[id] (detalhe) — não havia como navegar até um projeto
 * já fechado (aprovado) para reabrir indicações / trocar host. Esta lista resolve isso.
 * Admin entra em qualquer projeto para eleger host, compor/fechar equipe ou reabrir indicações.
 */
import React from 'react'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { listarProjetosVitrine } from '@/lib/data/projetos'
import { rotuloProjeto } from '@/lib/format/projeto'

const STATUS_LABEL: Record<string, string> = {
  em_analise: 'Recrutando equipe',
  aprovado: 'Equipe aprovada',
  aguardando_proposta: 'Aguardando proposta',
  proposta_em_analise: 'Proposta em análise',
  proposta_aprovada: 'Proposta aprovada',
  em_execucao: 'Em execução',
  finalizado: 'Finalizado',
}

export default async function ProjetosListaPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = !!user?.app_metadata?.is_admin

  const projetos = await listarProjetosVitrine()

  return (
    <main className="ubm-shell-main">
      <div className="ubm-section">
        <header className="ubm-page-header">
          <span className="ubm-cota ubm-section-kicker">PROJETOS{isAdmin ? ' · CURADORIA' : ''}</span>
          <h1 className="ubm-page-title">Projetos</h1>
          <p className="ubm-page-lead">
            {isAdmin
              ? 'Todos os projetos da plataforma. Entre em um projeto para eleger host, compor/fechar a equipe ou reabrir indicações.'
              : 'Acompanhe os projetos da plataforma e sua equipe.'}
          </p>
        </header>

        {projetos.length === 0 ? (
          <div className="ubm-empty">
            <div className="ubm-empty-node" aria-hidden />
            <p className="ubm-empty-title">Nenhum projeto ainda.</p>
            <p className="ubm-empty-msg">Os projetos nascem quando uma dor é publicada.</p>
          </div>
        ) : (
          <div className="ubm-dor-grid">
            {projetos.map((p) => {
              const rotulo = rotuloProjeto(p.titulo, p.empresa_nome)
              return (
                <article key={p.id} className="ubm-dor-card ubm-dor-card--linkable">
                  <div className="ubm-dor-card-head">
                    <h3 className="ubm-dor-card-empresa">
                      <Link
                        href={`/app/projetos/${p.id}`}
                        className="ubm-dor-card-link"
                        aria-label={`Abrir ${rotulo}`}
                      >
                        {rotulo}
                      </Link>
                    </h3>
                  </div>
                  <div className="ubm-dor-card-foot ubm-card-action-row">
                    <span className="ubm-cota ubm-cota--muted">
                      {STATUS_LABEL[p.status] ?? p.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
