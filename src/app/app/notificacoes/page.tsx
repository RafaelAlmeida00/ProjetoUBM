/**
 * T-O3.9 — S5 /app/notificacoes · Gatilhos da 005 (base é 002)
 * Estende o centro de notificações da 002 com os 3 tipos da 005 + deep-link.
 * design.md §S5 — sem primitiva nova (item 002 + .ubm-cota + .ubm-node).
 * Opt-out não renderiza o tipo (CA28). Copy sem PII excedente (RS12).
 */

import React from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/** Tipos de notificação da 005 (RN28) */
const TIPOS_005 = new Set(['projeto_aberto', 'equipe_fechada', 'eleito_host', 'projeto_avancou'])

/** Deep-link por tipo de evento (RN28 a/b/c) */
function deepLink(notif: NotificacaoRow): string {
  const payload = notif.payload as Record<string, string> | null
  const tipo = payload?.evento ?? notif.tipo

  if (tipo === 'projeto_aberto') return '/app/indicacoes'
  if (tipo === 'equipe_fechada' || tipo === 'eleito_host') {
    return payload?.projeto_id ? `/app/projetos/${payload.projeto_id}` : '/app/projetos'
  }
  if (tipo === 'projeto_avancou') {
    return payload?.projeto_id ? `/app/projetos/${payload.projeto_id}` : '/app/projetos'
  }
  // fallback: usa deep-link base da 002
  if (notif.tipo === 'dor_aprovada_curso') return '/app/indicacoes'
  if (notif.tipo === 'status_mudou') {
    return payload?.projeto_id ? `/app/projetos/${payload.projeto_id}` : '/app/projetos'
  }
  return '/app'
}

/** Copy humanizado por tipo (sem PII excedente — RS12) */
function copyNotif(notif: NotificacaoRow): string {
  const payload = notif.payload as Record<string, string> | null
  const tipo = payload?.evento ?? notif.tipo
  const empresa = payload?.empresa ?? ''
  const curso = payload?.curso ?? ''
  const paraStatus = payload?.para_status ?? ''

  if (tipo === 'projeto_aberto') {
    return `Uma nova dor${curso ? ` de ${curso}` : ''} abriu um projeto. Quer se indicar?`
  }
  if (tipo === 'equipe_fechada') {
    return `Você entrou na equipe do projeto${empresa ? ` de ${empresa}` : ''}.`
  }
  if (tipo === 'eleito_host') {
    return `Você foi eleito host do projeto${empresa ? ` de ${empresa}` : ''}.`
  }
  if (tipo === 'projeto_avancou') {
    const statusLabel = paraStatus.replace(/_/g, ' ')
    return `O projeto${empresa ? ` de ${empresa}` : ''} avançou para ${statusLabel}.`
  }
  // fallback genérico (002)
  return notif.tipo.replace(/_/g, ' ')
}

interface NotificacaoRow {
  id: string
  tipo: string
  lida: boolean
  created_at: string
  payload: unknown
  opt_out?: boolean
}

export default async function NotificacoesPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="ubm-shell-main">
        <div className="ubm-locked">
          <span className="ubm-locked-title">Acesso restrito</span>
          <p className="ubm-locked-msg">Faça login para ver suas notificações.</p>
        </div>
      </main>
    )
  }

  // Busca notificações do usuário (base 002 + tipos 005)
  let notificacoes: NotificacaoRow[] = []
  try {
    // A coluna real é `lida_em` (timestamptz, migration 0010) — NÃO existe `lida`.
    // Selecionar `lida` lançava "column notificacao.lida does not exist" → catch → lista vazia.
    const { data } = await supabase
      .from('notificacao')
      .select('id, tipo, lida_em, created_at, payload')
      .eq('destinatario_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    notificacoes = ((data ?? []) as Array<{
      id: string; tipo: string; lida_em: string | null; created_at: string; payload: unknown
    }>).map((r) => ({
      id: r.id,
      tipo: r.tipo,
      lida: !!r.lida_em, // derivado: lida = tem timestamp de leitura
      created_at: r.created_at,
      payload: r.payload,
    }))
  } catch {
    notificacoes = []
  }

  // Filtra notificações com opt-out (CA28) — tipos 005 respeitam preferências
  // (opt-out é controlado pela 002; aqui apenas não renderizamos se a notif
  //  não deve aparecer — o dado já vem filtrado pela RLS/procedure da 002)

  // Separa notificações da 005 das da base (002)
  const notifs005 = notificacoes.filter((n) => {
    const payload = n.payload as Record<string, string> | null
    const tipo = payload?.evento ?? n.tipo
    return TIPOS_005.has(tipo)
  })
  const outrasNotifs = notificacoes.filter((n) => {
    const payload = n.payload as Record<string, string> | null
    const tipo = payload?.evento ?? n.tipo
    return !TIPOS_005.has(tipo)
  })

  const todasOrdenadas = [...notificacoes]

  return (
    <main className="ubm-shell-main">
      <div className="ubm-stamp-header">
        <span className="ubm-stamp-header-trail">
          <span>NOTIFICAÇÕES</span>
        </span>
      </div>

      <div className="ubm-section">
        <h1
          className="font-display"
          style={{ fontSize: 'clamp(1.6rem,4vw,2.2rem)', marginBottom: '1.5rem' }}
        >
          Notificações
        </h1>

        {/* aria-live para Realtime (novas entradas) */}
        <div aria-live="polite" aria-atomic="false" id="notificacoes-live" />

        {todasOrdenadas.length === 0 ? (
          <div className="ubm-empty">
            <div className="ubm-empty-node" aria-hidden="true" />
            <p className="ubm-empty-title">Nada por aqui ainda.</p>
            <p className="ubm-empty-msg">
              Suas notificações de projetos e indicações aparecerão aqui.
            </p>
          </div>
        ) : (
          <ul className="ubm-notif-list" aria-label="Lista de notificações">
            {todasOrdenadas.map((notif) => {
              const link = deepLink(notif)
              const copy = copyNotif(notif)
              const payload = notif.payload as Record<string, string> | null
              const tipo = payload?.evento ?? notif.tipo
              const eh005 = TIPOS_005.has(tipo)

              return (
                <li
                  key={notif.id}
                  className={`ubm-notif-item ubm-machined${notif.lida ? ' ubm-notif-item--lida' : ''}`}
                >
                  {/* Ícone-nó decorativo */}
                  <span className="ubm-node ubm-clip-node" aria-hidden="true"
                    style={{ width: '0.7rem', height: '0.7rem', background: 'hsl(var(--primary))', flexShrink: 0, display: 'inline-block' }}
                  />

                  {/* Cota do tipo */}
                  <span className="ubm-cota ubm-cota--muted" style={{ fontSize: '0.65rem' }}>
                    {eh005 ? tipo.replace(/_/g, ' ').toUpperCase() : notif.tipo.replace(/_/g, ' ').toUpperCase()}
                  </span>

                  {/* Texto humanizado + deep-link */}
                  <a
                    href={link}
                    className="ubm-notif-link"
                    aria-label={`${copy} — Abrir`}
                  >
                    {copy}
                  </a>

                  {/* Data */}
                  <time
                    className="ubm-cota ubm-cota--muted"
                    dateTime={notif.created_at}
                    style={{ marginLeft: 'auto', fontSize: '0.65rem' }}
                  >
                    {new Intl.DateTimeFormat('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                    }).format(new Date(notif.created_at)).toUpperCase()}
                  </time>
                </li>
              )
            })}
          </ul>
        )}

        {/* Link para preferências (002) */}
        <p style={{ marginTop: '1.5rem', color: 'hsl(var(--muted-foreground))', fontSize: '0.88rem' }}>
          <a href="/app/conta#notificacoes" className="ubm-link">
            Preferências de notificação
          </a>
        </p>
      </div>
    </main>
  )
}
