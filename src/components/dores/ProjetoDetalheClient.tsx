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
import { fecharEquipe, trocarHost, elegerHost, reabrirIndicacoes, removerMembro, editarEquipe } from '@/lib/actions/equipe'
import { avancarProjeto } from '@/lib/actions/projeto'
import { criarTarefa, editarTarefa, concluirTarefa, reatribuirTarefa } from '@/lib/actions/tarefa'
import { UbmTeamBuilder } from '@/components/ubm-team-builder'
import { ElegerHostModal } from '@/components/indicacoes/ElegerHostModal'
import { UbmTaskList } from '@/components/ubm-task'
import { useToast } from '@/components/feedback/ToastProvider'

export interface ProjetoDetalheClientProps {
  projetoId: string
  indicacoes: Indicacao[]
  papelAtual: 'admin' | 'host' | 'aluno' | null
  projetoStatus: string
  /** true quando já há host eleito (projeto.host_coordenador_id setado). */
  hostElected?: boolean
  /** 0060 — pessoa_id do host eleito pelo admin. Com isso, o team-builder vira COMPOSIÇÃO
   *  (sem eleição de host na UI; só admin elege via ElegerHostModal). null = admin ainda sem host. */
  hostPessoaId?: string | null
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

type Modal = null | 'eleger' | 'trocar' | 'fechar' | 'editar'

export function ProjetoDetalheClient({
  projetoId,
  indicacoes,
  papelAtual,
  projetoStatus,
  hostElected = false,
  hostPessoaId = null,
  gestao = [],
  tarefas = [],
  currentUserId = null,
  equipe: _equipe = [],
  modoTarefas = false,
}: ProjetoDetalheClientProps) {
  const [modal, setModal] = useState<Modal>(null)
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const nomesIndicados = Object.fromEntries(
    indicacoes.map((i) => [i.pessoa_id, i.aluno_nome || i.aluno_email || `Indicado (${i.papel_pretendido})`]),
  )

  const handleAvancar = () => {
    startTransition(async () => {
      const res = await avancarProjeto(projetoId)
      if (res.ok) {
        toast.sucesso('Projeto avançou de estágio.')
      } else {
        toast.erro(res.error || 'Não foi possível avançar o projeto. Tente novamente.')
      }
    })
  }
  const handleReabrir = () => {
    startTransition(async () => {
      const res = await reabrirIndicacoes(projetoId)
      if (res.ok) {
        toast.sucesso('Indicações reabertas.')
      } else {
        toast.erro(res.error || 'Não foi possível reabrir as indicações. Tente novamente.')
      }
    })
  }
  const handleRemover = (pessoaId: string) => {
    startTransition(async () => {
      const res = await removerMembro(projetoId, pessoaId)
      if (res.ok) {
        toast.sucesso('Membro removido da equipe.')
      } else {
        toast.erro(res.error || 'Não foi possível remover o membro. Tente novamente.')
      }
    })
  }

  /** Handlers de modal que recebem o ActionResult e disparam toast. */
  const handleElegerHost = async (pid: string, hostPessoaId: string) => {
    const res = await elegerHost(pid, hostPessoaId)
    if (res.ok) {
      toast.sucesso('Host definido.')
      setModal(null)
    } else {
      toast.erro(res.error || 'Não foi possível definir o host. Tente novamente.')
    }
    return res
  }

  const handleTrocarHost = async (pid: string, hostPessoaId: string) => {
    const res = await trocarHost(pid, hostPessoaId)
    if (res.ok) {
      toast.sucesso('Host atualizado.')
      setModal(null)
    } else {
      toast.erro(res.error || 'Não foi possível trocar o host. Tente novamente.')
    }
    return res
  }

  const handleFecharEquipe = async (
    pid: string,
    hostFinal: string,
    membros: Array<{ pessoaId: string; papelProjeto: 'host' | 'co_coordenador' | 'aluno'; indicacaoId?: string }>,
  ) => {
    const res = await fecharEquipe(pid, hostFinal, membros)
    if (res.ok) {
      toast.sucesso('Equipe fechada.')
      setModal(null)
    } else {
      toast.erro(res.error || 'Não foi possível fechar a equipe. Tente novamente.')
    }
    return res
  }

  // Edição in-place da equipe (>= Equipe Aprovada), SEM reverter status. Host inalterado
  // (troca de host é só admin via trocar_host). Aditivo: adiciona quem já tem indicação ativa.
  const handleEditarEquipe = async (
    pid: string,
    _hostFinal: string,
    membros: Array<{ pessoaId: string; papelProjeto: 'host' | 'co_coordenador' | 'aluno'; indicacaoId?: string }>,
  ) => {
    const res = await editarEquipe(pid, membros)
    if (res.ok) {
      toast.sucesso('Equipe atualizada.')
      setModal(null)
    } else {
      toast.erro(res.error || 'Não foi possível atualizar a equipe. Tente novamente.')
    }
    return res
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
  // "Equipe formada" = qualquer estágio >= Equipe Aprovada (e antes de finalizado): a gestão
  // de equipe (editar/recompor + trocar host) fica disponível SEM reverter o status (decisão 2026-06-21).
  const equipeFormada = ['aprovado', 'aguardando_proposta', 'proposta_em_analise', 'proposta_aprovada', 'em_execucao'].includes(projetoStatus)

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

        {/* ── equipe formada (>= Equipe Aprovada): gestão in-place SEM reverter status ── */}
        {equipeFormada && (isAdmin || isHost) && (
          <button
            type="button"
            className="ubm-btn ubm-btn-primary"
            onClick={() => setModal('editar')}
            aria-label="Editar equipe (adicionar ou recompor membros)"
          >
            Editar equipe
          </button>
        )}
        {equipeFormada && isAdmin && (
          <button type="button" className="ubm-btn ubm-btn-secondary" onClick={() => setModal('trocar')}>
            Trocar host
          </button>
        )}

        {/* ── aprovado: reabertura (reverte → em_analise) e avanço do host ── */}
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

      {/* ── Modais ── */}
      {modal === 'eleger' && (
        <ElegerHostModal
          projetoId={projetoId}
          indicacoes={indicacoes}
          nomesIndicados={nomesIndicados}
          onFechar={() => setModal(null)}
          onConfirmar={handleElegerHost}
        />
      )}
      {modal === 'trocar' && (
        <ElegerHostModal
          projetoId={projetoId}
          indicacoes={indicacoes}
          titulo="Trocar host"
          nomesIndicados={nomesIndicados}
          onFechar={() => setModal(null)}
          // em_analise: re-elege (mantém aberto). >= aprovado: troca host real (trocar_host).
          onConfirmar={emAnalise ? handleElegerHost : handleTrocarHost}
        />
      )}
      {modal === 'fechar' && (
        <UbmTeamBuilder
          projetoId={projetoId}
          indicacoes={indicacoes}
          nomesIndicados={nomesIndicados}
          hostPessoaId={hostPessoaId}
          membrosExistentes={gestao.map((m) => m.pessoa_id)}
          onFechar={() => setModal(null)}
          onConfirmar={handleFecharEquipe}
        />
      )}
      {modal === 'editar' && (
        <UbmTeamBuilder
          projetoId={projetoId}
          indicacoes={indicacoes}
          nomesIndicados={nomesIndicados}
          hostPessoaId={hostPessoaId}
          membrosExistentes={gestao.map((m) => m.pessoa_id)}
          onFechar={() => setModal(null)}
          onConfirmar={handleEditarEquipe}
        />
      )}
    </div>
  )
}
