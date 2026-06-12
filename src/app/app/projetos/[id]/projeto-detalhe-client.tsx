'use client'

/**
 * Componente client de ações do projeto-detalhe (S3).
 * Admin: abre modal fechar-equipe / trocar host.
 * Host: avança para proposta.
 * P0.2: modoTarefas=true renderiza UbmTaskList com actions wired.
 */

import React, { useState, useTransition } from 'react'
import type { Indicacao, FuncaoTarefa, MembroPublico } from '@/lib/data/projetos'
import { fecharEquipe, trocarHost } from '@/lib/actions/equipe'
import { avancarProjeto } from '@/lib/actions/projeto'
import { criarTarefa, editarTarefa, concluirTarefa, reatribuirTarefa } from '@/lib/actions/tarefa'
import { UbmTeamBuilder } from '@/components/ubm-team-builder'
import { UbmTaskList } from '@/components/ubm-task'

export interface ProjetoDetalheClientProps {
  projetoId: string
  indicacoes: Indicacao[]
  papelAtual: 'admin' | 'host' | 'aluno' | null
  projetoStatus: string
  /** P0.2: tarefas do projeto (privadas, passadas via RSC sob RLS) */
  tarefas?: FuncaoTarefa[]
  /** P0.2: userId do usuário logado (para responsável de nova tarefa) */
  currentUserId?: string | null
  /** P0.2: equipe pública (sem userId — usado para display; reatribuição limitada) */
  equipe?: MembroPublico[]
  /** P0.2: quando true, renderiza SOMENTE a seção de tarefas (evita duplicação no page) */
  modoTarefas?: boolean
}

export function ProjetoDetalheClient({
  projetoId,
  indicacoes,
  papelAtual,
  projetoStatus,
  tarefas = [],
  currentUserId = null,
  equipe: _equipe = [],
  modoTarefas = false,
}: ProjetoDetalheClientProps) {
  const [modalAberto, setModalAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleAvancar = () => {
    startTransition(async () => {
      setErro(null)
      const res = await avancarProjeto(projetoId)
      if (!res.ok) setErro(res.error)
    })
  }

  // P0.2: admin age como host para tarefas
  const papelParaTarefa: 'host' | 'co_coordenador' | 'aluno' | null =
    papelAtual === 'host' || papelAtual === 'admin' ? 'host' :
    papelAtual === 'aluno' ? 'aluno' :
    null

  // P0.2: handlers wired para as actions de tarefa
  const handleConcluir = async (tarefaId: string) => concluirTarefa(tarefaId)
  const handleEditar = async (id: string, titulo: string) => editarTarefa({ id, titulo })
  const handleReatribuir = async (tarefaId: string, novoResponsavelId: string) =>
    reatribuirTarefa(tarefaId, novoResponsavelId)
  const handleCriar = async (titulo: string) =>
    criarTarefa({
      projetoId,
      responsavelId: currentUserId ?? '',
      titulo,
    })

  // modoTarefas=true: renderiza apenas a UbmTaskList (sem ações de equipe)
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

  // Modo padrão: ações de equipe (fechar equipe / trocar host / avançar)
  return (
    <div className="ubm-projeto-acoes" style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
      {/* Admin: fechar equipe */}
      {papelAtual === 'admin' && projetoStatus === 'em_analise' && (
        <button
          type="button"
          className="ubm-btn ubm-btn-primary"
          onClick={() => setModalAberto(true)}
          aria-label="Fechar equipe e eleger host"
        >
          Fechar equipe e eleger host
        </button>
      )}

      {/* Admin: trocar host (só quando aprovado) */}
      {papelAtual === 'admin' && projetoStatus === 'aprovado' && (
        <button
          type="button"
          className="ubm-btn ubm-btn-secondary"
          onClick={() => setModalAberto(true)}
          aria-label="Trocar host"
        >
          Trocar host
        </button>
      )}

      {/* Host: avançar para proposta */}
      {papelAtual === 'host' && projetoStatus === 'aprovado' && (
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

      {erro && (
        <p role="alert" style={{ color: 'hsl(var(--destructive))', fontSize: '0.9rem', width: '100%' }}>
          {erro}
        </p>
      )}

      {/* Modal de fechar equipe */}
      {modalAberto && (
        <UbmTeamBuilder
          projetoId={projetoId}
          indicacoes={indicacoes}
          onFechar={() => setModalAberto(false)}
          onConfirmar={fecharEquipe}
        />
      )}
    </div>
  )
}
