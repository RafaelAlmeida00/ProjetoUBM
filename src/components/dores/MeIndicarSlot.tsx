'use client'
import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'

export type EstadoIndicacao =
  | 'disponivel'
  | 'ja_indicado'
  | 'ja_membro'
  | 'coord_pendente'
  | 'nao_verificado'

interface MeIndicarSlotProps {
  /** ID do PROJETO (não da dor): indicar_se / retirar_indicacao operam por projeto_id (RN9). */
  projetoId: string
  empresaNome: string
  papelBase: 'aluno' | 'coordenador'
  estado: EstadoIndicacao
  onIndicar: (id: string, papel: 'aluno' | 'coordenador') => Promise<{ ok: boolean; error?: string }>
  onRetirar: (id: string) => Promise<{ ok: boolean; error?: string }>
}

/**
 * Onda 2 — B6: slot de ação "Me indicar" nos cards de dor.
 * Árvore de estados: disponivel | ja_indicado | ja_membro | coord_pendente | nao_verificado.
 * Atualização otimista: disponivel → ja_indicado após sucesso, e vice-versa.
 * Fail-safe: sem estado definido → nada renderizado (ver DorCardItem).
 * A11y: aria-live no chip de troca; role=alert no erro.
 */
export function MeIndicarSlot({
  projetoId,
  empresaNome,
  papelBase,
  estado: estadoInicial,
  onIndicar,
  onRetirar,
}: MeIndicarSlotProps) {
  const [estado, setEstado] = useState<EstadoIndicacao>(estadoInicial)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // coord_pendente: silêncio total no card
  if (estado === 'coord_pendente') return null

  // nao_verificado: link discreto (sem botão)
  if (estado === 'nao_verificado') {
    return (
      <a href="/app/conta" className="ubm-link" style={{ fontSize: '0.85rem' }}>
        Verifique sua conta para se indicar
      </a>
    )
  }

  // ja_membro: chip só-leitura
  if (estado === 'ja_membro') {
    return (
      <span className="ubm-member-papel-chip ubm-member-papel-chip--coordenador">
        VOCÊ É DA EQUIPE
      </span>
    )
  }

  const handleIndicar = () => {
    setErro(null)
    startTransition(async () => {
      const res = await onIndicar(projetoId, papelBase)
      if (res.ok) {
        setEstado('ja_indicado')
      } else {
        setErro(res.error ?? 'Não foi possível enviar a indicação. Tente novamente.')
      }
    })
  }

  const handleRetirar = () => {
    setErro(null)
    startTransition(async () => {
      const res = await onRetirar(projetoId)
      if (res.ok) {
        setEstado('disponivel')
      } else {
        setErro(res.error ?? 'Não foi possível retirar a indicação. Tente novamente.')
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {/* ja_indicado: chip + Retirar */}
      {estado === 'ja_indicado' && (
        <span className="ubm-card-action-status" aria-live="polite">
          <span className="ubm-member-papel-chip ubm-member-papel-chip--aluno">
            VOCÊ JÁ SE INDICOU
          </span>
          <button
            type="button"
            className="ubm-btn ubm-btn-secondary"
            onClick={handleRetirar}
            disabled={isPending}
            aria-label="Retirar minha indicação"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : 'Retirar'}
          </button>
        </span>
      )}

      {/* disponivel: botão primário */}
      {estado === 'disponivel' && (
        <button
          type="button"
          className="ubm-btn ubm-btn-primary"
          onClick={handleIndicar}
          disabled={isPending}
          aria-label={`Me indicar para a dor de ${empresaNome}`}
        >
          {isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Enviando…
            </>
          ) : (
            'Me indicar'
          )}
        </button>
      )}

      {/* Erro */}
      {erro && (
        <p role="alert" className="ubm-indicate-cta-erro" style={{ fontSize: '0.82rem', color: 'hsl(var(--destructive))' }}>
          {erro}
        </p>
      )}
    </div>
  )
}
