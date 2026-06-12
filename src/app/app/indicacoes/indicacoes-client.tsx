'use client'

/**
 * T-O3.4 — S2 /app/indicacoes · Componente client de auto-indicação
 * CTA "Indicar-me" → "JÁ INDICADO · Retirar" com aria-live.
 * design.md §S2/§4 — .ubm-indicate-cta / .ubm-locked.
 */

import React, { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/actions/indicacao'

export interface IndicacaoStatus {
  jaIndicado: boolean
  verificado: boolean
  janelaAberta: boolean // projeto.status === 'em_analise'
}

export interface IndicacoesClientProps {
  projetoId: string
  papelBase: 'aluno' | 'coordenador'
  status: IndicacaoStatus
  onIndicar: (projetoId: string, papel: 'aluno' | 'coordenador') => Promise<ActionResult>
  onRetirar: (projetoId: string) => Promise<ActionResult>
}

export function IndicacoesCta({
  projetoId,
  papelBase,
  status,
  onIndicar,
  onRetirar,
}: IndicacoesClientProps) {
  const [jaIndicado, setJaIndicado] = useState(status.jaIndicado)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleIndicar = () => {
    startTransition(async () => {
      setErro(null)
      const res = await onIndicar(projetoId, papelBase)
      if (res.ok) setJaIndicado(true)
      else setErro(res.error)
    })
  }

  const handleRetirar = () => {
    startTransition(async () => {
      setErro(null)
      const res = await onRetirar(projetoId)
      if (res.ok) setJaIndicado(false)
      else setErro(res.error)
    })
  }

  // Não verificado → peça lacrada (RN8/CA7)
  if (!status.verificado) {
    return (
      <div className="ubm-indicate-cta ubm-locked">
        <span className="ubm-locked-icon" aria-hidden="true">🔒</span>
        <span className="ubm-locked-title">Verifique sua conta</span>
        <p className="ubm-locked-msg">
          Verifique sua conta para se indicar.{' '}
          <a href="/app/conta" className="ubm-link">Ir para conta</a>
        </p>
      </div>
    )
  }

  // Janela fechada → desabilitado (RN9/CA8)
  if (!status.janelaAberta) {
    return (
      <div className="ubm-indicate-cta ubm-indicate-cta--encerrada">
        <span className="ubm-cota ubm-cota--muted">INDICAÇÕES ENCERRADAS</span>
        <p className="ubm-indicate-cta-msg">A equipe deste projeto já foi formada.</p>
      </div>
    )
  }

  return (
    <div className="ubm-indicate-cta ubm-machined">
      {/* aria-live para anunciar mudança de estado */}
      <div aria-live="polite" aria-atomic="true" className="ubm-indicate-cta-live">
        {jaIndicado ? (
          <div className="ubm-indicate-cta-indicado">
            <span className="ubm-cota">JÁ INDICADO</span>
            <button
              type="button"
              className="ubm-btn ubm-btn-secondary"
              onClick={handleRetirar}
              disabled={isPending}
              aria-label="Retirar minha indicação"
            >
              · Retirar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="ubm-btn ubm-btn-primary"
            onClick={handleIndicar}
            disabled={isPending}
            aria-label={`Indicar-me como ${papelBase}`}
          >
            Indicar-me
          </button>
        )}
      </div>

      {erro && (
        <p role="alert" className="ubm-indicate-cta-erro">
          {erro}
        </p>
      )}
    </div>
  )
}
