'use client'

/**
 * T-O3.5 — Componente UbmTeamBuilder (.ubm-team-builder)
 * Modal admin para fechar equipe + eleger host.
 * A11y: foco preso, ESC fecha, Enter confirma (só com host válido).
 * Erros tipados PT-BR inline sem perder seleção (CA11/CA12).
 * design.md §S3/§4.
 */

import React, { useState, useEffect, useRef, useTransition } from 'react'
import type { Indicacao } from '@/lib/data/projetos'
import type { ActionResult } from '@/lib/actions/equipe'

export interface UbmTeamBuilderProps {
  projetoId: string
  indicacoes: Indicacao[]
  onFechar: () => void
  onConfirmar: (
    projetoId: string,
    hostPessoaId: string,
    membros: Array<{ pessoaId: string; papelProjeto: 'host' | 'co_coordenador' | 'aluno'; indicacaoId?: string }>,
  ) => Promise<ActionResult>
  /** Nomes dos indicados para exibição (mapeados por pessoa_id) */
  nomesIndicados?: Record<string, string>
  /**
   * 0060 — host JÁ eleito pelo admin. Quando setado, o builder vira COMPOSIÇÃO:
   *  - NÃO oferece eleição de host (só admin elege/troca via ElegerHostModal);
   *  - o host fixo é enviado ao fechar_equipe (não escolhido na UI).
   * Quando null/undefined (override do admin SEM host eleito), mantém a eleição inline.
   */
  hostPessoaId?: string | null
  /**
   * 0060 — pessoa_ids que JÁ são membros da equipe (inclui o host e quem o admin já adicionou).
   * São EXCLUÍDOS da lista de selecionáveis (não dá para "selecionar quem já faz parte").
   */
  membrosExistentes?: string[]
}

export function UbmTeamBuilder({
  projetoId,
  indicacoes,
  onFechar,
  onConfirmar,
  nomesIndicados = {},
  hostPessoaId = null,
  membrosExistentes = [],
}: UbmTeamBuilderProps) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [hostId, setHostId] = useState<string>('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const modalRef = useRef<HTMLDivElement>(null)
  const primeiroFocusRef = useRef<HTMLButtonElement>(null)

  // host já eleito → modo composição (sem eleição de host na UI)
  const hostFixo = !!hostPessoaId

  // Foco preso no modal (a11y)
  useEffect(() => {
    primeiroFocusRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
      if (e.key === 'Enter' && !isPending) handleConfirmar()

      // Foco preso: Tab / Shift+Tab dentro do modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFechar, isPending, hostId, selecionados])

  // Exclui quem JÁ é membro (host eleito + adicionados pelo admin): não dá para
  // "selecionar quem já faz parte" nem o próprio host (que já está na equipe).
  // Defesa-em-profundidade: o hostPessoaId é SEMPRE excluído, mesmo que `membrosExistentes`
  // chegue vazio (ex.: listarEquipeGestao degradou) — o host nunca é selecionável.
  const membrosSet = new Set([...membrosExistentes, ...(hostPessoaId ? [hostPessoaId] : [])])
  const ativas = indicacoes.filter((ind) => !ind.deleted_at)
  const disponiveis = ativas.filter((ind) => !membrosSet.has(ind.pessoa_id))
  const coordenadores = disponiveis.filter((ind) => ind.papel_pretendido === 'coordenador')

  const toggleMembro = (pessoaId: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(pessoaId)) {
        next.delete(pessoaId)
        // Se era o host, limpa
        if (hostId === pessoaId) setHostId('')
      } else {
        next.add(pessoaId)
      }
      return next
    })
    setErro(null)
  }

  const validar = (): string | null => {
    // host já eleito (modo composição): não exige eleição — o admin já definiu o host.
    if (hostFixo) return null
    if (!hostId) return 'Escolha exatamente um host para a equipe.'
    const hostEhCoordIndicado = coordenadores.some(
      (ind) => ind.pessoa_id === hostId && selecionados.has(hostId),
    )
    if (!hostEhCoordIndicado) return 'O host deve ser um coordenador com indicação ativa neste projeto.'
    return null
  }

  const handleConfirmar = () => {
    const erroValidacao = validar()
    if (erroValidacao) {
      setErro(erroValidacao)
      return
    }
    startTransition(async () => {
      const membros = Array.from(selecionados).map((pessoaId) => {
        const ind = disponiveis.find((i) => i.pessoa_id === pessoaId)
        const ehHost = !hostFixo && pessoaId === hostId
        const papel = ehHost
          ? 'host'
          : ind?.papel_pretendido === 'coordenador'
          ? 'co_coordenador'
          : 'aluno'
        return {
          pessoaId,
          papelProjeto: papel as 'host' | 'co_coordenador' | 'aluno',
          indicacaoId: ind?.id,
        }
      })
      // host fixo (eleito pelo admin) ou, no override do admin sem host, o escolhido na UI.
      const hostFinal = hostFixo ? (hostPessoaId as string) : hostId
      const res = await onConfirmar(projetoId, hostFinal, membros)
      if (!res.ok) {
        // Mapeia erros específicos mantendo a seleção
        if (/host.*exist|duplicate.*host/i.test(res.error)) {
          setErro('Já existe um host ativo neste projeto.')
        } else {
          setErro(res.error)
        }
      } else {
        onFechar()
      }
    })
  }

  const numSelecionados = selecionados.size
  const resumo =
    numSelecionados > 0
      ? `${numSelecionados} membro${numSelecionados > 1 ? 's' : ''}${hostId ? ` · host: ${nomesIndicados[hostId] ?? hostId}` : ''}`
      : 'Nenhum membro selecionado'

  return (
    <div
      className="ubm-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-builder-title"
    >
      <div
        ref={modalRef}
        className="ubm-team-builder ubm-modal ubm-machined"
      >
        {/* Cabeçalho */}
        <div className="ubm-team-builder-header">
          <h2 id="team-builder-title" className="ubm-confirm-title">
            {hostFixo ? 'Compor equipe' : 'Fechar equipe e eleger host'}
          </h2>
          <button
            ref={primeiroFocusRef}
            type="button"
            className="ubm-btn ubm-btn-ghost ubm-team-builder-close"
            aria-label="Fechar modal"
            onClick={onFechar}
          >
            ✕
          </button>
        </div>

        <p className="ubm-confirm-msg">
          {hostFixo
            ? 'O host já foi definido. Selecione os membros que entram na equipe e feche.'
            : 'Selecione os membros e eleja 1 coordenador como host.'}
        </p>

        {/* Lista de indicados com checkboxes */}
        <fieldset className="ubm-team-builder-membros">
          <legend className="ubm-cota">Indicados</legend>
          {disponiveis.length === 0 ? (
            <p className="ubm-empty-msg">
              {ativas.length === 0
                ? 'Nenhuma indicação ativa neste projeto.'
                : 'Todos os indicados já fazem parte da equipe.'}
            </p>
          ) : (
            <ul className="ubm-team-builder-lista" aria-label="Selecionar membros">
              {disponiveis.map((ind) => {
                const nome = nomesIndicados[ind.pessoa_id] ?? `Indicado (${ind.papel_pretendido})`
                const ehCoord = ind.papel_pretendido === 'coordenador'
                const estaSelecionado = selecionados.has(ind.pessoa_id)

                return (
                  <li key={ind.id} className="ubm-team-builder-item">
                    {/* Checkbox de membro */}
                    <label className="ubm-team-builder-membro-label">
                      <input
                        type="checkbox"
                        checked={estaSelecionado}
                        onChange={() => toggleMembro(ind.pessoa_id)}
                        aria-label={`Selecionar ${nome}`}
                      />
                      <span className="ubm-team-builder-membro-nome">{nome}</span>
                      <span className={`ubm-member-papel-chip ubm-member-papel-chip--${ind.papel_pretendido}`}>
                        {ind.papel_pretendido === 'coordenador' ? 'COORDENADOR' : 'ALUNO'}
                      </span>
                    </label>

                    {/* Rádio de host — só no override do admin SEM host eleito.
                        Com host fixo (eleito pelo admin), o host NÃO é escolhido aqui. */}
                    {!hostFixo && ehCoord && estaSelecionado && (
                      <label
                        className="ubm-team-builder-host-label"
                        aria-describedby="host-restricao"
                      >
                        <input
                          type="radio"
                          name="host"
                          value={ind.pessoa_id}
                          checked={hostId === ind.pessoa_id}
                          onChange={() => { setHostId(ind.pessoa_id); setErro(null) }}
                          aria-label={`Eleger ${nome} como host`}
                        />
                        <span>Host</span>
                      </label>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {!hostFixo && (
            <p id="host-restricao" className="ubm-cota ubm-cota--muted ubm-team-builder-restricao">
              O host deve ser um coordenador indicado.
            </p>
          )}
        </fieldset>

        {/* Resumo */}
        <div className="ubm-team-builder-resumo ubm-cota ubm-cota--muted" aria-live="polite">
          {resumo}
        </div>

        {/* Erro inline (sem perder seleção) */}
        {erro && (
          <p role="alert" className="ubm-team-builder-erro">
            {erro}
          </p>
        )}

        {/* Loader comunicante */}
        {isPending && (
          <div className="ubm-loader" aria-live="assertive">
            <p className="ubm-loader-msg">Formando a equipe…</p>
          </div>
        )}

        {/* Ações */}
        <div className="ubm-confirm-actions">
          <button
            type="button"
            className="ubm-btn ubm-btn-ghost"
            onClick={onFechar}
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="ubm-btn ubm-btn-primary"
            onClick={handleConfirmar}
            // C2 fix (G4): manter habilitado quando há membros selecionados — assim handleConfirmar
            // chama validar() e renderiza role="alert" com o erro (CA11/CA12), em vez de o botão
            // ficar cinza e o usuário ficar sem feedback. A validação já barra o submit indevido.
            disabled={isPending}
          >
            Confirmar equipe
          </button>
        </div>
      </div>
    </div>
  )
}
