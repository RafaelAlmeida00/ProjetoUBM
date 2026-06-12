'use client'

/**
 * T-O3.2 — Componentes UbmTeam / UbmMember / .ubm-anon-tag / .ubm-optin-seal
 * design.md §4/§6.2 — equipe pública/interna, host stamp, nome condicional.
 * UI renderiza o que o dado entrega (não é barreira — sigilo vive na camada de dado).
 */

import React from 'react'
import type { MembroPublico } from '@/lib/data/projetos'

const PAPEL_LABELS: Record<string, string> = {
  host: 'HOST',
  co_coordenador: 'CO-COORDENADOR',
  aluno: 'ALUNO',
}

export interface UbmTeamProps {
  membros: MembroPublico[]
  /** Se verdadeiro, exibe em modo resumido (para S3 — projeto-detalhe) */
  resumido?: boolean
}

export function UbmTeam({ membros, resumido = false }: UbmTeamProps) {
  if (membros.length === 0) {
    return (
      <div className="ubm-team ubm-team--vazio">
        <div className="ubm-empty">
          <div className="ubm-empty-node" aria-hidden="true" />
          <p className="ubm-empty-title">Equipe ainda em formação.</p>
          <p className="ubm-empty-msg">Os membros aparecerão aqui após a equipe ser fechada.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`ubm-team${resumido ? ' ubm-team--resumido' : ''}`}>
      <ul className="ubm-team-list" aria-label="Equipe do projeto">
        {membros.map((membro, i) => (
          <UbmMember key={i} membro={membro} />
        ))}
      </ul>
    </div>
  )
}

export interface UbmMemberProps {
  membro: MembroPublico
}

export function UbmMember({ membro }: UbmMemberProps) {
  const { papel_projeto, nome_ou_papel, ranking_optin } = membro
  const isHost = papel_projeto === 'host'
  const papelLabel = PAPEL_LABELS[papel_projeto] ?? papel_projeto.toUpperCase()

  return (
    <li
      className={[
        'ubm-member ubm-machined',
        `ubm-member--${papel_projeto}`,
        isHost ? 'ubm-member--host' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`Membro: ${nome_ou_papel}, papel: ${papelLabel}`}
    >
      {/* Avatar-losango */}
      <div className="ubm-member-avatar ubm-clip-node" aria-hidden="true">
        <span className="ubm-member-avatar-inicial">
          {ranking_optin && nome_ou_papel
            ? nome_ou_papel.charAt(0).toUpperCase()
            : papel_projeto.charAt(0).toUpperCase()}
        </span>
      </div>

      <div className="ubm-member-body">
        {/* Nome ou anon-tag */}
        {ranking_optin ? (
          <div className="ubm-member-nome font-display">
            {nome_ou_papel}
            {/* Selo de perfil público (opt-in) */}
            <span className="ubm-optin-seal ubm-cota" aria-label="Perfil público">
              <span className="ubm-optin-seal-node ubm-clip-node" aria-hidden="true" />
              PERFIL PÚBLICO
            </span>
          </div>
        ) : (
          <div className="ubm-anon-tag ubm-cota" aria-label={`Membro anônimo: ${nome_ou_papel}`}>
            <span className="ubm-anon-tag-icon" aria-hidden="true">
              {/* silhueta neutra — não cadeado (design §4) */}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                <path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              </svg>
            </span>
            {/* Texto papel+curso — nunca só ícone (a11y) */}
            <span className="ubm-anon-tag-texto">{nome_ou_papel}</span>
          </div>
        )}

        {/* Chip de papel-no-projeto */}
        <div className="ubm-member-chips">
          <span className={`ubm-member-papel-chip ubm-member-papel-chip--${papel_projeto}`}>
            {papelLabel}
          </span>
        </div>
      </div>

      {/* Stamp HOST (marsala) */}
      {isHost && (
        <span className="ubm-stamp ubm-member-host-stamp" aria-label="Host do projeto">
          HOST
        </span>
      )}
    </li>
  )
}
