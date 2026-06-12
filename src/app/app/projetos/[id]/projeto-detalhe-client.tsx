'use client'

/**
 * Componente client de ações do projeto-detalhe (S3).
 * Admin: abre modal fechar-equipe / trocar host.
 * Host: avança para proposta.
 */

import React, { useState, useTransition } from 'react'
import type { Indicacao } from '@/lib/data/projetos'
import { fecharEquipe, trocarHost } from '@/lib/actions/equipe'
import { avancarProjeto } from '@/lib/actions/projeto'
import { UbmTeamBuilder } from '@/components/ubm-team-builder'

export interface ProjetoDetalheClientProps {
  projetoId: string
  indicacoes: Indicacao[]
  papelAtual: 'admin' | 'host' | 'aluno' | null
  projetoStatus: string
}

export function ProjetoDetalheClient({
  projetoId,
  indicacoes,
  papelAtual,
  projetoStatus,
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
