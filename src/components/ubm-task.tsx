'use client'

/**
 * T-O3.6 — Componentes UbmTask / UbmTaskList (.ubm-task / .ubm-task-list)
 * design.md §4/§6.4 — funções/tarefas por papel.
 * Aluno edita as suas; host/co editam/reatribuem todas.
 * Privado ao projeto (não-membro não acessa o dado — RLS).
 */

import React, { useState, useTransition } from 'react'
import type { FuncaoTarefa } from '@/lib/data/projetos'
import type { ActionResult } from '@/lib/actions/tarefa'

export interface UbmTaskProps {
  tarefa: FuncaoTarefa
  currentUserId: string | null
  /** 'host' | 'co_coordenador' | 'aluno' | null (não-membro não chega aqui — RLS) */
  papelAtual: 'host' | 'co_coordenador' | 'aluno' | null
  membros?: Array<{ id: string; label: string }>
  onConcluir?: (tarefaId: string) => Promise<ActionResult>
  onEditar?: (id: string, titulo: string) => Promise<ActionResult>
  onReatribuir?: (tarefaId: string, novoResponsavelId: string) => Promise<ActionResult>
}

export function UbmTask({
  tarefa,
  currentUserId,
  papelAtual,
  membros = [],
  onConcluir,
  onEditar,
  onReatribuir,
}: UbmTaskProps) {
  const ehMinha = tarefa.responsavel_id === currentUserId
  const podeEditar = papelAtual === 'host' || papelAtual === 'co_coordenador' || ehMinha
  const podeReatribuir = papelAtual === 'host' || papelAtual === 'co_coordenador'

  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [tituloEdit, setTituloEdit] = useState(tarefa.titulo)
  const [erro, setErro] = useState<string | null>(null)

  const handleConcluir = () => {
    if (!onConcluir) return
    startTransition(async () => {
      const res = await onConcluir(tarefa.id)
      if (!res.ok) setErro(res.error)
    })
  }

  const handleSalvarEditar = () => {
    if (!onEditar) return
    startTransition(async () => {
      const res = await onEditar(tarefa.id, tituloEdit)
      if (res.ok) setEditando(false)
      else setErro(res.error)
    })
  }

  const handleReatribuir = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!onReatribuir) return
    const novoId = e.target.value
    if (!novoId) return
    startTransition(async () => {
      const res = await onReatribuir(tarefa.id, novoId)
      if (!res.ok) setErro(res.error)
    })
  }

  return (
    <li
      className={[
        'ubm-task ubm-machined',
        tarefa.concluida ? 'ubm-task--done' : '',
        ehMinha ? 'ubm-task--mine' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`Tarefa: ${tarefa.titulo}, responsável: ${ehMinha ? 'você' : 'outro membro'}${tarefa.concluida ? ', concluída' : ''}`}
    >
      {/* Check de conclusão (micro) */}
      <button
        type="button"
        className="ubm-task-check"
        aria-label={tarefa.concluida ? 'Tarefa concluída' : 'Marcar como concluída'}
        aria-pressed={tarefa.concluida}
        disabled={tarefa.concluida || !podeEditar || isPending}
        onClick={handleConcluir}
      >
        {tarefa.concluida ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </button>

      <div className="ubm-task-body">
        {editando && podeEditar ? (
          <div className="ubm-task-edit">
            <input
              type="text"
              value={tituloEdit}
              onChange={(e) => setTituloEdit(e.target.value)}
              className="ubm-task-edit-input"
              aria-label="Título da tarefa"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSalvarEditar()
                if (e.key === 'Escape') setEditando(false)
              }}
              autoFocus
            />
            <div className="ubm-task-edit-actions">
              <button type="button" className="ubm-btn ubm-btn-primary" onClick={handleSalvarEditar} disabled={isPending}>
                Salvar
              </button>
              <button type="button" className="ubm-btn ubm-btn-ghost" onClick={() => setEditando(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <span className="ubm-task-titulo">{tarefa.titulo}</span>
        )}

        {/* Cota "DE OUTRO MEMBRO" para tarefas de outro membro (read-only) */}
        {!ehMinha && papelAtual === 'aluno' && (
          <span className="ubm-cota ubm-cota--muted ubm-task-outro">DE OUTRO MEMBRO</span>
        )}

        {/* Reatribuição (host/co) */}
        {podeReatribuir && membros.length > 0 && (
          <select
            className="ubm-task-reatribuir"
            aria-label="Reatribuir tarefa para"
            value={tarefa.responsavel_id}
            onChange={handleReatribuir}
            disabled={isPending}
          >
            <option value="">Reatribuir para…</option>
            {membros.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Ação de editar (quem pode) */}
      {podeEditar && !editando && !tarefa.concluida && (
        <button
          type="button"
          className="ubm-task-editar ubm-btn ubm-btn-ghost"
          aria-label="Editar tarefa"
          onClick={() => setEditando(true)}
          disabled={isPending}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9.5 1.5L12.5 4.5L5 12H2V9L9.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Feedback de erro */}
      {erro && (
        <p role="alert" className="ubm-task-erro">
          {erro}
        </p>
      )}
    </li>
  )
}

export interface UbmTaskListProps {
  tarefas: FuncaoTarefa[]
  currentUserId: string | null
  papelAtual: 'host' | 'co_coordenador' | 'aluno' | null
  membros?: Array<{ id: string; label: string }>
  onConcluir?: (tarefaId: string) => Promise<ActionResult>
  onEditar?: (id: string, titulo: string) => Promise<ActionResult>
  onReatribuir?: (tarefaId: string, novoResponsavelId: string) => Promise<ActionResult>
  onCriar?: (titulo: string) => Promise<ActionResult>
}

export function UbmTaskList({
  tarefas,
  currentUserId,
  papelAtual,
  membros = [],
  onConcluir,
  onEditar,
  onReatribuir,
  onCriar,
}: UbmTaskListProps) {
  const podeCriar = papelAtual === 'host' || papelAtual === 'co_coordenador' || papelAtual === 'aluno'
  const [criando, setCriando] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [isPending, startTransition] = useTransition()
  const [erroGlobal, setErroGlobal] = useState<string | null>(null)

  const ativas = tarefas.filter((t) => !t.deleted_at)

  const handleCriar = () => {
    if (!onCriar || !novoTitulo.trim()) return
    startTransition(async () => {
      const res = await onCriar(novoTitulo.trim())
      if (res.ok) {
        setNovoTitulo('')
        setCriando(false)
      } else {
        setErroGlobal(res.error)
      }
    })
  }

  return (
    <div className="ubm-task-list">
      {ativas.length === 0 ? (
        <div className="ubm-empty">
          <div className="ubm-empty-node" aria-hidden="true" />
          <p className="ubm-empty-msg">
            Nenhuma tarefa ainda. Organize o trabalho da equipe.
          </p>
          {podeCriar && onCriar && (
            <button
              type="button"
              className="ubm-btn ubm-btn-secondary"
              onClick={() => setCriando(true)}
            >
              Criar tarefa
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className="ubm-task-items" aria-label="Tarefas do projeto">
            {ativas.map((tarefa) => (
              <UbmTask
                key={tarefa.id}
                tarefa={tarefa}
                currentUserId={currentUserId}
                papelAtual={papelAtual}
                membros={membros}
                onConcluir={onConcluir}
                onEditar={onEditar}
                onReatribuir={onReatribuir}
              />
            ))}
          </ul>
          {podeCriar && onCriar && !criando && (
            <button
              type="button"
              className="ubm-btn ubm-btn-ghost ubm-task-btn-criar"
              onClick={() => setCriando(true)}
            >
              + Criar tarefa
            </button>
          )}
        </>
      )}

      {/* Formulário de criação inline */}
      {criando && (
        <div className="ubm-task-criar-form ubm-machined">
          <input
            type="text"
            value={novoTitulo}
            onChange={(e) => setNovoTitulo(e.target.value)}
            placeholder="Título da nova tarefa…"
            className="ubm-task-edit-input"
            aria-label="Nova tarefa"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCriar()
              if (e.key === 'Escape') setCriando(false)
            }}
            autoFocus
            disabled={isPending}
          />
          <div className="ubm-task-edit-actions">
            <button type="button" className="ubm-btn ubm-btn-primary" onClick={handleCriar} disabled={isPending || !novoTitulo.trim()}>
              Criar
            </button>
            <button type="button" className="ubm-btn ubm-btn-ghost" onClick={() => setCriando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erroGlobal && (
        <p role="alert" className="ubm-task-erro">
          {erroGlobal}
        </p>
      )}
    </div>
  )
}
