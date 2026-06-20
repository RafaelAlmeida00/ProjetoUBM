'use client'

/**
 * Componente client de ações do projeto-detalhe (S3) — fluxo de host (0060).
 *  - Admin ELEGE host (sem fechar; projeto segue aberto a indicações) e pode trocar/reabrir/fechar(emergência).
 *  - HOST compõe a equipe e fecha (→ aprovado), depois avança para a proposta.
 *  - Host e admin removem membros (não a si; o host não por aqui).
 * P0.2: modoTarefas=true renderiza UbmTaskList com actions wired.
 */

import React, { useState, useTransition } from 'react'
import type { Indicacao, FuncaoTarefa, MembroPublico, MembroGestao } from '@/lib/data/projetos'
import { fecharEquipe, trocarHost, elegerHost, reabrirIndicacoes, removerMembro } from '@/lib/actions/equipe'
import { avancarProjeto } from '@/lib/actions/projeto'
import { criarTarefa, editarTarefa, concluirTarefa, reatribuirTarefa } from '@/lib/actions/tarefa'
import { UbmTeamBuilder } from '@/components/ubm-team-builder'
import { ElegerHostModal } from '@/components/indicacoes/ElegerHostModal'
import { UbmTaskList } from '@/components/ubm-task'

export interface ProjetoDetalheClientProps {
  projetoId: string
  indicacoes: Indicacao[]
  papelAtual: 'admin' | 'host' | 'aluno' | null
  projetoStatus: string
  /** true quando já há host eleito (projeto.host_coordenador_id setado). */
  hostElected?: boolean
  /** membros com pessoa_id+nome (admin/host) para remoção. */
  gestao?: MembroGestao[]
  /** P0.2: tarefas do projeto (privadas, passadas via RSC sob RLS) */
  tarefas?: FuncaoTarefa[]
  /** P0.2: userId do usuário logado (para responsável de nova tarefa) */
  currentUserId?: string | null
  /** P0.2: equipe pública (sem userId — usado para display; reatribuição limitada) */
  equipe?: MembroPublico[]
  /** P0.2: quando true, renderiza SOMENTE a seção de tarefas (evita duplicação no page) */
  modoTarefas?: boolean
}

type Modal = null | 'eleger' | 'trocar' | 'fechar'

export function ProjetoDetalheClient({
  projetoId,
  indicacoes,
  papelAtual,
  projetoStatus,
  hostElected = false,
  gestao = [],
  tarefas = [],
  currentUserId = null,
  equipe: _equipe = [],
  modoTarefas = false,
}: ProjetoDetalheClientProps) {
  const [modal, setModal] = useState<Modal>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const nomesIndicados = Object.fromEntries(
    indicacoes.map((i) => [i.pessoa_id, i.aluno_nome || i.aluno_email || `Indicado (${i.papel_pretendido})`]),
  )

  const handleAvancar = () => {
    startTransition(async () => {
      setErro(null)
      const res = await avancarProjeto(projetoId)
      if (!res.ok) setErro(res.error)
    })
  }
  const handleReabrir = () => {
    startTransition(async () => {
      setErro(null)
      const res = await reabrirIndicacoes(projetoId)
      if (!res.ok) setErro(res.error)
    })
  }
  const handleRemover = (pessoaId: string) => {
    startTransition(async () => {
      setErro(null)
      const res = await removerMembro(projetoId, pessoaId)
      if (!res.ok) setErro(res.error)
    })
  }

  // P0.2: admin age como host para tarefas
  const papelParaTarefa: 'host' | 'co_coordenador' | 'aluno' | null =
    papelAtual === 'host' || papelAtual === 'admin' ? 'host' :
    papelAtual === 'aluno' ? 'aluno' :
    null

  const handleConcluir = async (tarefaId: string) => concluirTarefa(tarefaId)
  const handleEditar = async (id: string, titulo: string) => editarTarefa({ id, titulo })
  const handleReatribuir = async (tarefaId: string, novoResponsavelId: string) =>
    reatribuirTarefa(tarefaId, novoResponsavelId)
  const handleCriar = async (titulo: string) =>
    criarTarefa({ projetoId, responsavelId: currentUserId ?? '', titulo })

  if (modoTarefas) {
    return (
      <UbmTaskList
        tarefas={tarefas}
        currentUserId={currentUserId}
        papelAtual={papelParaTarefa}
        membros={[]}
        onConcluir={handleConcluir}
        onEditar={handleEditar}
        onReatribuir={handleReatribuir}
        onCriar={papelParaTarefa === 'host' || papelParaTarefa === 'aluno' ? handleCriar : undefined}
      />
    )
  }

  const isAdmin = papelAtual === 'admin'
  const isHost = papelAtual === 'host'
  const emAnalise = projetoStatus === 'em_analise'
  const aprovado = projetoStatus === 'aprovado'

  // membros removíveis: não o próprio usuário, não o host (troca via eleger/trocar host)
  const removiveis = gestao.filter((m) => m.pessoa_id !== currentUserId && m.papel_projeto !== 'host')

  return (
    <div className="ubm-projeto-acoes" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* ── em_analise (aberto a indicações) ── */}
        {emAnalise && isAdmin && (
          <button
            type="button"
            className="ubm-btn ubm-btn-primary"
            onClick={() => setModal(hostElected ? 'trocar' : 'eleger')}
          >
            {hostElected ? 'Trocar host' : 'Eleger host'}
          </button>
        )}
        {emAnalise && isAdmin && (
          <button
            type="button"
            className="ubm-btn ubm-btn-secondary"
            onClick={() => setModal('fechar')}
            aria-label="Fechar equipe (emergência do admin)"
          >
            Fechar equipe (admin)
          </button>
        )}
        {emAnalise && isHost && (
          <button
            type="button"
            className="ubm-btn ubm-btn-primary"
            onClick={() => setModal('fechar')}
          >
            Compor equipe e fechar
          </button>
        )}

        {/* ── aprovado ── */}
        {aprovado && isAdmin && (
          <button type="button" className="ubm-btn ubm-btn-secondary" onClick={() => setModal('trocar')}>
            Trocar host
          </button>
        )}
        {aprovado && isAdmin && (
          <button type="button" className="ubm-btn ubm-btn-ghost" onClick={handleReabrir} disabled={isPending}>
            Reabrir indicações
          </button>
        )}
        {aprovado && isHost && (
          <button
            type="button"
            className="ubm-btn ubm-btn-primary"
            onClick={handleAvancar}
            disabled={isPending}
            aria-label="Avançar para a proposta"
          >
            Avançar para a proposta
          </button>
        )}
      </div>

      {/* ── Gerência de membros (remover) — admin/host com equipe ── */}
      {(isAdmin || isHost) && removiveis.length > 0 && (
        <div className="ubm-membros-gestao" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span className="ubm-cota ubm-cota--muted">Gerenciar membros</span>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {removiveis.map((m) => (
              <li key={m.pessoa_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span>
                  {m.nome || 'Membro'}
                  <span className="ubm-cota ubm-cota--muted" style={{ marginLeft: '0.5rem' }}>
                    {m.papel_projeto === 'co_coordenador' ? 'CO-COORDENADOR' : 'ALUNO'}
                  </span>
                </span>
                <button
                  type="button"
                  className="ubm-btn ubm-btn-ghost"
                  onClick={() => handleRemover(m.pessoa_id)}
                  disabled={isPending}
                  aria-label={`Remover ${m.nome || 'membro'} da equipe`}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {erro && (
        <p role="alert" style={{ color: 'hsl(var(--destructive))', fontSize: '0.9rem', width: '100%' }}>
          {erro}
        </p>
      )}

      {/* ── Modais ── */}
      {modal === 'eleger' && (
        <ElegerHostModal
          projetoId={projetoId}
          indicacoes={indicacoes}
          nomesIndicados={nomesIndicados}
          onFechar={() => setModal(null)}
          onConfirmar={elegerHost}
        />
      )}
      {modal === 'trocar' && (
        <ElegerHostModal
          projetoId={projetoId}
          indicacoes={indicacoes}
          titulo="Trocar host"
          nomesIndicados={nomesIndicados}
          onFechar={() => setModal(null)}
          // em_analise: re-elege (mantém aberto). aprovado: troca host (pós-fechamento).
          onConfirmar={aprovado ? trocarHost : elegerHost}
        />
      )}
      {modal === 'fechar' && (
        <UbmTeamBuilder
          projetoId={projetoId}
          indicacoes={indicacoes}
          nomesIndicados={nomesIndicados}
          onFechar={() => setModal(null)}
          onConfirmar={fecharEquipe}
        />
      )}
    </div>
  )
}
