'use client'
import { useState, useId } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { StatusDor } from './StatusDor'
import { CURSOS_UBM } from '@/lib/courses'

export interface DorCard {
  id: string
  empresa_nome: string
  descricao: string
  status: 'rascunho' | 'em_moderacao' | 'publicada' | 'rejeitada'
  cursos: string[]
  publicada_em?: string | null
  criada_em?: string | null
  aprovado_por?: string | null
}

interface DoresPageProps {
  doresPublicadas: DorCard[]
  minhasDores: DorCard[]
  isRepresentante: boolean
  isVerificado: boolean
  /** true quando o usuário está autenticado (com ou sem papel). Usado para mostrar
   *  o CTA de onboarding quando o usuário está logado mas ainda não concluiu o cadastro.
   *  Padrão false (retro-compatível). */
  isAutenticado?: boolean
}

function labelCurso(value: string): string {
  return CURSOS_UBM.find((c) => c.value === value)?.label ?? value
}

function DorCardItem({ dor, minha }: { dor: DorCard; minha?: boolean }) {
  const acessivel = `Dor de ${dor.empresa_nome} — ${dor.status}`
  return (
    <Link
      href={`/app/dores/${dor.id}`}
      className={`ubm-dor-card${minha ? ' ubm-dor-card--dor' : ''}`}
      aria-label={acessivel}
    >
      <div className="ubm-dor-card-head">
        <span className="ubm-dor-card-empresa">{dor.empresa_nome}</span>
        <StatusDor
          status={dor.status}
          aprovadoPor={dor.aprovado_por}
          pulso={dor.status === 'em_moderacao' && !dor.aprovado_por}
        />
      </div>
      <p className="ubm-dor-card-desc">{dor.descricao}</p>
      {dor.cursos.length > 0 && (
        <div className="ubm-dor-card-cursos">
          {dor.cursos.map((c) => (
            <span key={c} className="ubm-dor-card-curso">{labelCurso(c)}</span>
          ))}
        </div>
      )}
      <div className="ubm-dor-card-foot">
        <span className="ubm-cota ubm-cota--muted">
          {(dor.publicada_em ?? dor.criada_em)
            ? new Date(dor.publicada_em ?? dor.criada_em!).toLocaleDateString('pt-BR')
            : '—'}
        </span>
      </div>
    </Link>
  )
}

/**
 * T7 — /app/dores: vitrine de dores publicadas + minhas dores.
 * Tabs WAI-ARIA; aba "Minhas dores" só para representante.
 *
 * B-003 task #3: isAutenticado controla o CTA de onboarding para
 * usuários logados sem papel (RN21/CA27/CA28).
 */
export function DoresPage({
  doresPublicadas,
  minhasDores,
  isRepresentante,
  isVerificado,
  isAutenticado = false,
}: DoresPageProps) {
  const tabsId = useId()
  const [abaAtiva, setAbaAtiva] = useState<'vitrine' | 'minhas'>('vitrine')

  const vitrineId = `${tabsId}-vitrine`
  const minhasId = `${tabsId}-minhas`
  const painelId = `${tabsId}-painel`

  // Usuário autenticado mas sem papel ainda (onboarding não concluído)
  const semPapel = isAutenticado && !isRepresentante

  return (
    <section className="ubm-section">
      <div className="ubm-stamp-header" style={{ marginBottom: '1.5rem' }}>
        <div className="ubm-stamp-header-trail">
          <span>APP</span>
          <span>/</span>
          <b>DORES</b>
        </div>
        <div className="ubm-stamp-header-actions">
          {isRepresentante && isVerificado && (
            <Link href="/app/dores/nova" className="ubm-btn ubm-btn-primary" style={{ height: '2.5rem', fontSize: '0.88rem' }}>
              Propor nova dor
            </Link>
          )}
          {isRepresentante && !isVerificado && (
            <div className="ubm-locked" style={{ padding: '0.5rem 1rem', flexDirection: 'row', gap: '0.5rem' }}>
              <Lock size={14} aria-hidden className="ubm-locked-icon" style={{ width: '1rem', height: '1rem' }} />
              <span className="ubm-locked-msg" style={{ fontSize: '0.85rem' }}>
                Verifique sua conta para criar dores
              </span>
            </div>
          )}
          {semPapel && (
            <Link
              href="/app/onboarding"
              className="ubm-btn ubm-btn-secondary"
              style={{ height: '2.5rem', fontSize: '0.88rem' }}
            >
              Complete seu cadastro
            </Link>
          )}
        </div>
      </div>

      {/* Tabs WAI-ARIA */}
      <div role="tablist" aria-label="Visualização de dores" className="ubm-tablist">
        <button
          id={vitrineId}
          role="tab"
          aria-selected={abaAtiva === 'vitrine'}
          aria-controls={painelId}
          className={`ubm-btn ubm-btn-ghost${abaAtiva === 'vitrine' ? ' is-active' : ''}`}
          onClick={() => setAbaAtiva('vitrine')}
          tabIndex={abaAtiva === 'vitrine' ? 0 : -1}
        >
          Vitrine
        </button>
        {isRepresentante && (
          <button
            id={minhasId}
            role="tab"
            aria-selected={abaAtiva === 'minhas'}
            aria-controls={painelId}
            className={`ubm-btn ubm-btn-ghost${abaAtiva === 'minhas' ? ' is-active' : ''}`}
            onClick={() => setAbaAtiva('minhas')}
            tabIndex={abaAtiva === 'minhas' ? 0 : -1}
          >
            Minhas dores
          </button>
        )}
      </div>

      {/* Painel */}
      <div
        id={painelId}
        role="tabpanel"
        aria-labelledby={abaAtiva === 'vitrine' ? vitrineId : minhasId}
        style={{ marginTop: '1.25rem' }}
      >
        {abaAtiva === 'vitrine' && (
          <>
            {doresPublicadas.length === 0 ? (
              <div className="ubm-empty">
                <div className="ubm-empty-node" aria-hidden />
                <p className="ubm-empty-title">Ainda não há dores publicadas.</p>
                <p className="ubm-empty-msg">
                  {semPapel ? (
                    <>
                      Para propor sua própria dor,{' '}
                      <Link href="/app/onboarding" className="ubm-link">
                        complete seu cadastro
                      </Link>{' '}
                      e escolha seu papel.
                    </>
                  ) : isRepresentante ? (
                    'Seja o primeiro a propor uma dor.'
                  ) : (
                    'Conheça como funciona a plataforma.'
                  )}
                </p>
              </div>
            ) : (
              <div className="ubm-dor-grid">
                {doresPublicadas.map((d) => (
                  <DorCardItem key={d.id} dor={d} />
                ))}
              </div>
            )}
          </>
        )}

        {abaAtiva === 'minhas' && (
          <>
            {minhasDores.length === 0 ? (
              <div className="ubm-empty">
                <div className="ubm-empty-node" aria-hidden />
                <p className="ubm-empty-title">Você ainda não criou nenhuma dor.</p>
                <p className="ubm-empty-msg">
                  <Link href="/app/dores/nova" className="ubm-link">Propor minha primeira dor</Link>
                </p>
              </div>
            ) : (
              <div className="ubm-dor-grid">
                {minhasDores.map((d) => (
                  <DorCardItem key={d.id} dor={d} minha />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
