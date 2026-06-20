'use client'
/**
 * ADR-0002 — Bancada por papel (Q2)
 * Componentes de UI por papel: BancadaRepresentante, BancadaAluno,
 * BancadaCoordenador, BancadaAdmin.
 *
 * Princípio: 1 ação dominante por papel + ≤3 atalhos. Marsala só em pendência crítica.
 * Dados chegam como props (RSC pai os busca sob RLS). Zero className fantasma.
 * Cada componente renderiza corretamente com dados vazios (degradação graciosa).
 */

import Link from 'next/link'
import type { MeuProjeto, TarefaAberta, MinhaIndicacao, Indicacao, ContagemDoresPorStatus } from '@/lib/data/projetos'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Saudação por hora do dia (PT-BR).
 * Fallback para "Bem-vindo" quando nome não está disponível.
 */
function saudacao(nome: string | null): string {
  if (!nome) return 'Bem-vindo à sua bancada.'
  const h = new Date().getHours()
  const turno = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  return `${turno}, ${nome.split(' ')[0]}.`
}

/**
 * Badge numérico de pendência — só renderiza quando n > 0 (evita badge zero).
 * Marsala via .ubm-status--fila (pendência crítica, conforme design-system.md).
 */
function BadgePendencia({ n, label }: { n: number; label: string }) {
  if (n === 0) return null
  return (
    <span className="ubm-status ubm-status--fila" aria-label={`${n} ${label}`}>
      {n}
    </span>
  )
}

// ---------------------------------------------------------------------------
// BancadaRepresentante
// ---------------------------------------------------------------------------

export interface BancadaRepresentanteProps {
  meusProjetos: MeuProjeto[]
  contagemDores: ContagemDoresPorStatus
  nome: string | null
}

/**
 * Bancada do representante (empresa).
 * Primeiro olhar: status das minhas dores + propor.
 * CTA dominante: Propor nova dor.
 */
export function BancadaRepresentante({ meusProjetos, contagemDores, nome }: BancadaRepresentanteProps) {
  const temProjetos = meusProjetos.length > 0
  const emModeracao = contagemDores.em_moderacao ?? 0
  const publicadas = contagemDores.publicada ?? 0

  // Métrica enxuta: frase de estado (não número solto)
  function metrica(): string {
    if (contagemDores.total === 0) return 'Nenhuma dor proposta ainda.'
    const partes: string[] = []
    if (emModeracao > 0) partes.push(`${emModeracao} em moderação`)
    if (publicadas > 0) partes.push(`${publicadas} publicada${publicadas > 1 ? 's' : ''}`)
    return partes.length > 0
      ? `Você tem ${partes.join(' e ')}.`
      : `${contagemDores.total} dor${contagemDores.total > 1 ? 'es' : ''} no total.`
  }

  return (
    <div className="ubm-bancada">
      {/* Saudação */}
      <div className="ubm-bancada-header">
        <span className="ubm-cota">BANCADA · REPRESENTANTE</span>
        <h1 className="ubm-bancada-titulo font-display">{saudacao(nome)}</h1>
        <p className="ubm-bancada-metrica ubm-cota ubm-cota--muted">{metrica()}</p>
      </div>

      {/* Bloco dominante — Minhas dores */}
      <section
        className="ubm-card ubm-card--dominant ubm-bancada-bloco"
        aria-labelledby="rep-bloco-title"
      >
        <span className="ubm-cota">MINHAS DORES</span>
        <h2 id="rep-bloco-title" className="ubm-bancada-bloco-titulo">
          Minhas dores
          {emModeracao > 0 && (
            <BadgePendencia n={emModeracao} label="em moderação" />
          )}
        </h2>

        {temProjetos ? (
          <ul className="ubm-bancada-lista" aria-label="Meus projetos vinculados a dores">
            {meusProjetos.slice(0, 5).map((p) => (
              <li key={p.projeto_id} className="ubm-bancada-lista-item">
                <Link
                  href={`/dores/${p.dor_id}`}
                  className="ubm-bancada-lista-link ubm-link"
                  aria-label={`Ver dor de ${p.empresa_nome}`}
                >
                  {p.empresa_nome || 'Dor sem empresa'}
                </Link>
                <span className="ubm-status ubm-status--publicada">{p.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ubm-empty">
            <div className="ubm-empty-node" aria-hidden />
            <p className="ubm-empty-title">Nenhuma dor proposta ainda.</p>
            <p className="ubm-empty-msg">
              Conte um problema real da sua empresa. A engenharia da UBM cuida do resto.
            </p>
          </div>
        )}

        {/* CTA dominante azul */}
        <div className="ubm-bancada-bloco-actions">
          <Link href="/app/dores/nova" className="ubm-btn ubm-btn-primary" aria-label="Propor nova dor">
            Propor nova dor →
          </Link>
        </div>
      </section>

      {/* Atalhos (≤3) */}
      <div className="ubm-bancada-atalhos" aria-label="Atalhos rápidos">
        <span className="ubm-cota">ATALHOS</span>
        <div className="ubm-bancada-atalhos-grid">
          <Link href="/app/dores" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">Minhas dores</span>
          </Link>
          <Link href="/app/conta" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">Editar perfil</span>
          </Link>
          <Link href="/app/notificacoes" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">Notificações</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BancadaAluno
// ---------------------------------------------------------------------------

export interface BancadaAlunoProps {
  indicacoes: MinhaIndicacao[]
  tarefas: TarefaAberta[]
  nome: string | null
}

/**
 * Bancada do aluno.
 * Primeiro olhar: oportunidades (engajamento, não burocracia).
 * CTA dominante: Ver dores do meu curso.
 */
export function BancadaAluno({ indicacoes, tarefas, nome }: BancadaAlunoProps) {
  const temIndicacoes = indicacoes.length > 0
  const temTarefas = tarefas.length > 0

  function metrica(): string {
    if (!temIndicacoes && !temTarefas) return 'Explore as dores publicadas e se candidate.'
    const partes: string[] = []
    if (temIndicacoes) partes.push(`${indicacoes.length} indicação${indicacoes.length > 1 ? 'ões' : ''} ativa${indicacoes.length > 1 ? 's' : ''}`)
    if (temTarefas) partes.push(`${tarefas.length} tarefa${tarefas.length > 1 ? 's' : ''} aberta${tarefas.length > 1 ? 's' : ''}`)
    return partes.join(' · ')
  }

  return (
    <div className="ubm-bancada">
      {/* Saudação */}
      <div className="ubm-bancada-header">
        <span className="ubm-cota">BANCADA · ALUNO</span>
        <h1 className="ubm-bancada-titulo font-display">{saudacao(nome)}</h1>
        <p className="ubm-bancada-metrica ubm-cota ubm-cota--muted">{metrica()}</p>
      </div>

      {/* Bloco dominante — Oportunidades */}
      <section
        className="ubm-card ubm-card--dominant ubm-bancada-bloco"
        aria-labelledby="aluno-bloco-title"
      >
        <span className="ubm-cota">OPORTUNIDADES</span>
        <h2 id="aluno-bloco-title" className="ubm-bancada-bloco-titulo">Oportunidades para você</h2>

        {!temIndicacoes && !temTarefas ? (
          <div className="ubm-empty">
            <div className="ubm-empty-node" aria-hidden />
            <p className="ubm-empty-title">Sem novas oportunidades agora.</p>
            <p className="ubm-empty-msg">
              Quando surgir uma dor do seu curso, ela aparece aqui primeiro.
            </p>
          </div>
        ) : (
          <p className="ubm-bancada-resumo">
            {temIndicacoes && (
              <span>{indicacoes.length} indicaç{indicacoes.length > 1 ? 'ões' : 'ão'} ativa{indicacoes.length > 1 ? 's' : ''} aguardando. </span>
            )}
            {temTarefas && (
              <span>{tarefas.length} tarefa{tarefas.length > 1 ? 's' : ''} aberta{tarefas.length > 1 ? 's' : ''} no seu projeto.</span>
            )}
          </p>
        )}

        {/* CTA dominante */}
        <div className="ubm-bancada-bloco-actions">
          <Link href="/app/dores" className="ubm-btn ubm-btn-primary" aria-label="Ver dores do meu curso">
            Ver dores do meu curso →
          </Link>
        </div>
      </section>

      {/* Atalhos (≤3) */}
      <div className="ubm-bancada-atalhos" aria-label="Atalhos rápidos">
        <span className="ubm-cota">ATALHOS</span>
        <div className="ubm-bancada-atalhos-grid">
          <Link href="/app/indicacoes" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">
              Minhas indicações
              {temIndicacoes && <BadgePendencia n={indicacoes.length} label="indicações ativas" />}
            </span>
          </Link>
          <Link href="/app/projetos" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">
              Minhas tarefas
              {temTarefas && <BadgePendencia n={tarefas.length} label="tarefas abertas" />}
            </span>
          </Link>
          <Link href="/app/conta" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">Meu perfil</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BancadaCoordenador
// ---------------------------------------------------------------------------

export interface BancadaCoordenadorProps {
  indicacoes: Indicacao[]
  nome: string | null
  /** Projeto (em_analise) onde o coordenador é HOST — habilita o CTA "Compor equipe". */
  hostProjetoId?: string
}

/**
 * Bancada do coordenador.
 * Primeiro olhar: fila de decisão.
 * CTA dominante: Revisar indicações.
 * Badge marsala na contagem — única licença de marsala fora do selo "Finalizado".
 */
export function BancadaCoordenador({ indicacoes, nome, hostProjetoId }: BancadaCoordenadorProps) {
  const pendentes = indicacoes.filter((i) => !i.deleted_at)
  const temPendencias = pendentes.length > 0

  function metrica(): string {
    if (!temPendencias) return 'Sua fila está em dia.'
    return `${pendentes.length} indicaç${pendentes.length > 1 ? 'ões' : 'ão'} ${hostProjetoId ? 'para compor sua equipe' : 'no(s) seu(s) projeto(s)'}.`
  }

  return (
    <div className="ubm-bancada">
      {/* Saudação */}
      <div className="ubm-bancada-header">
        <span className="ubm-cota">BANCADA · COORDENADOR</span>
        <h1 className="ubm-bancada-titulo font-display">{saudacao(nome)}</h1>
        <p className="ubm-bancada-metrica ubm-cota ubm-cota--muted">{metrica()}</p>
      </div>

      {/* Bloco dominante — Fila */}
      <section
        className="ubm-card ubm-card--dominant ubm-bancada-bloco"
        aria-labelledby="coord-bloco-title"
      >
        <span className="ubm-cota">SUA FILA</span>
        <h2 id="coord-bloco-title" className="ubm-bancada-bloco-titulo">
          Fila de decisão
          {temPendencias && (
            <BadgePendencia n={pendentes.length} label="indicações pendentes" />
          )}
        </h2>

        {temPendencias ? (
          <ul className="ubm-bancada-lista" aria-label="Indicações pendentes">
            {pendentes.slice(0, 5).map((ind) => (
              <li key={ind.id} className="ubm-bancada-lista-item">
                <span className="ubm-bancada-lista-label">{ind.aluno_nome || ind.aluno_email || 'Indicado'}</span>
                <span className="ubm-cota ubm-cota--muted">{ind.curso}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ubm-empty">
            <div className="ubm-empty-node" aria-hidden />
            <p className="ubm-empty-title">Sua fila está em dia.</p>
            <p className="ubm-empty-msg">
              Nenhuma indicação ou equipe esperando por você agora.
            </p>
          </div>
        )}

        {/* CTA dominante */}
        <div className="ubm-bancada-bloco-actions">
          {hostProjetoId ? (
            <Link href={`/app/projetos/${hostProjetoId}`} className="ubm-btn ubm-btn-primary" aria-label="Compor equipe">
              Compor equipe →
            </Link>
          ) : (
            <Link href="/app/indicacoes" className="ubm-btn ubm-btn-primary" aria-label="Ver indicações">
              Ver indicações →
            </Link>
          )}
        </div>
      </section>

      {/* Atalhos (≤3) */}
      <div className="ubm-bancada-atalhos" aria-label="Atalhos rápidos">
        <span className="ubm-cota">ATALHOS</span>
        <div className="ubm-bancada-atalhos-grid">
          <Link href="/app/projetos" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">Projetos em execução</span>
          </Link>
          <Link href="/app/dores" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">Dores do meu curso</span>
          </Link>
          <Link href="/app/notificacoes" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">Notificações</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BancadaAdmin
// ---------------------------------------------------------------------------

export interface BancadaAdminProps {
  qtdDoresPendentes: number
  qtdProjetosPendentes: number
  nome: string | null
}

/**
 * Bancada do admin.
 * Primeiro olhar: saúde da plataforma (sóbrio, números reais).
 * CTA dominante: Moderar dores.
 */
export function BancadaAdmin({ qtdDoresPendentes, qtdProjetosPendentes, nome }: BancadaAdminProps) {
  const temPendencias = qtdDoresPendentes > 0 || qtdProjetosPendentes > 0

  function metrica(): string {
    if (!temPendencias) return 'Plataforma saudável. Nada aguardando moderação.'
    const partes: string[] = []
    if (qtdDoresPendentes > 0) partes.push(`${qtdDoresPendentes} dor${qtdDoresPendentes > 1 ? 'es' : ''} aguardando moderação`)
    if (qtdProjetosPendentes > 0) partes.push(`${qtdProjetosPendentes} projeto${qtdProjetosPendentes > 1 ? 's' : ''} aguardando equipe`)
    return partes.join(' · ')
  }

  return (
    <div className="ubm-bancada">
      {/* Saudação */}
      <div className="ubm-bancada-header">
        <span className="ubm-cota">BANCADA · ADMIN</span>
        <h1 className="ubm-bancada-titulo font-display">{saudacao(nome)}</h1>
        <p className="ubm-bancada-metrica ubm-cota ubm-cota--muted">{metrica()}</p>
      </div>

      {/* Bloco dominante — Moderação */}
      <section
        className="ubm-card ubm-card--dominant ubm-bancada-bloco"
        aria-labelledby="admin-bloco-title"
      >
        <span className="ubm-cota">MODERAÇÃO PENDENTE</span>
        <h2 id="admin-bloco-title" className="ubm-bancada-bloco-titulo">
          Moderação pendente
          {qtdDoresPendentes > 0 && (
            <BadgePendencia n={qtdDoresPendentes} label="dores pendentes" />
          )}
        </h2>

        {temPendencias ? (
          <ul className="ubm-bancada-lista" aria-label="Pendências de moderação">
            {qtdDoresPendentes > 0 && (
              <li className="ubm-bancada-lista-item">
                <span className="ubm-bancada-lista-label">
                  {qtdDoresPendentes} dor{qtdDoresPendentes > 1 ? 'es' : ''} em análise
                </span>
                <span className="ubm-status ubm-status--moderacao">dores</span>
              </li>
            )}
            {qtdProjetosPendentes > 0 && (
              <li className="ubm-bancada-lista-item">
                <span className="ubm-bancada-lista-label">
                  {qtdProjetosPendentes} projeto{qtdProjetosPendentes > 1 ? 's' : ''} aguardando host/equipe
                </span>
                <span className="ubm-status ubm-status--moderacao">recrutando</span>
              </li>
            )}
          </ul>
        ) : (
          <div className="ubm-empty">
            <div className="ubm-empty-node" aria-hidden />
            <p className="ubm-empty-title">Plataforma saudável.</p>
            <p className="ubm-empty-msg">Nada aguardando moderação. Tudo fluindo.</p>
          </div>
        )}

        {/* CTA dominante */}
        <div className="ubm-bancada-bloco-actions">
          <Link href="/admin/dores" className="ubm-btn ubm-btn-primary" aria-label="Moderar dores">
            Moderar dores →
          </Link>
          {qtdProjetosPendentes > 0 && (
            <Link href="/app/indicacoes" className="ubm-btn ubm-btn-secondary" aria-label="Compor equipes">
              Compor equipes →
            </Link>
          )}
        </div>
      </section>

      {/* Atalhos (≤3) */}
      <div className="ubm-bancada-atalhos" aria-label="Atalhos rápidos">
        <span className="ubm-cota">ATALHOS</span>
        <div className="ubm-bancada-atalhos-grid">
          <Link href="/admin/usuarios" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">Usuários &amp; papéis</span>
          </Link>
          <Link href="/admin/auditoria" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">Auditoria</span>
          </Link>
          <Link href="/app/dores" className="ubm-card ubm-card--interactive ubm-bancada-atalho">
            <span className="ubm-bancada-atalho-label">Vitrine</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
