'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Lock, CornerUpLeft, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { StatusDor } from './StatusDor'
import { submeterDor } from '@/lib/actions/dor'
import { CURSOS_UBM } from '@/lib/courses'

export interface DorData {
  id: string
  empresa_nome: string
  descricao: string
  status: 'rascunho' | 'em_moderacao' | 'publicada' | 'rejeitada'
  cursos: string[]
  publicada_em?: string | null
  criada_em?: string | null
  aprovado_por?: string | null
  motivo_rejeicao?: string | null
  autor_id: string
}

interface DorDetalheProps {
  dor: DorData
  currentUserId: string | null
  isAdmin: boolean
}

function labelCurso(value: string): string {
  return CURSOS_UBM.find((c) => c.value === value)?.label ?? value
}

/**
 * T8 — /app/dores/[id]: visão da dor (parcial — timeline/equipe = 005).
 * Sigilo: dor não-pública a terceiros → ubm-locked (nunca 404).
 * Aprovada-aguardando → ponte para verificar e-mail.
 * Rejeitada → motivo ao autor + CTA "Corrigir e reenviar".
 */
export function DorDetalhe({ dor, currentUserId, isAdmin }: DorDetalheProps) {
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')

  const isAutor = !!currentUserId && currentUserId === dor.autor_id
  const isAprovadaAguardando = dor.status === 'em_moderacao' && !!dor.aprovado_por

  /* ── Controle de acesso visual (CA18) ─────────────────────── */
  const podeVer = dor.status === 'publicada' || isAutor || isAdmin
  if (!podeVer) {
    return (
      <article className="ubm-section" style={{ maxWidth: '40rem' }}>
        <div className="ubm-locked">
          <Lock className="ubm-locked-icon" aria-hidden />
          <span className="ubm-cota">RESTRITO</span>
          <p className="ubm-locked-title">Esta dor não está pública.</p>
          <p className="ubm-locked-msg">
            Visível apenas ao autor e à moderação da UBM.
          </p>
        </div>
      </article>
    )
  }

  /* ── Reenvio (rejeitada → em_moderacao, CA9) ──────────────── */
  const handleReenviar = async () => {
    setEnviando(true)
    setErroEnvio('')
    const result = await submeterDor(dor.id)
    setEnviando(false)
    if (result.ok) {
      setEnviado(true)
    } else {
      setErroEnvio(result.error)
    }
  }

  return (
    <article className="ubm-section" style={{ maxWidth: '56rem' }}>
      {/* ── Cabeçalho-carimbo ── */}
      <header style={{ marginBottom: '1.5rem' }}>
        <div className="ubm-stamp-header-trail" style={{ marginBottom: '0.75rem' }}>
          <span>APP</span>
          <span>/</span>
          <Link href="/app/dores" className="ubm-link">DORES</Link>
          <span>/</span>
          <b>{dor.empresa_nome.toUpperCase()}</b>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 className="font-display" style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', lineHeight: 1.15, margin: 0 }}>
            {dor.empresa_nome}
          </h1>
          <StatusDor
            status={dor.status}
            aprovadoPor={dor.aprovado_por}
            pulso={dor.status === 'em_moderacao' && !dor.aprovado_por}
          />
        </div>
        <p className="ubm-cota ubm-cota--muted" style={{ marginTop: '0.5rem' }}>
          {dor.publicada_em
            ? `Publicada em ${new Date(dor.publicada_em).toLocaleDateString('pt-BR')}`
            : dor.criada_em
              ? `Proposta em ${new Date(dor.criada_em).toLocaleDateString('pt-BR')}`
              : ''}
        </p>
      </header>

      {/* ── Ponte "aprovada-aguardando" (A1 CA10/CA11) ── */}
      {isAprovadaAguardando && isAutor && (
        <div
          className="ubm-machined"
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            borderColor: 'hsl(var(--info) / 0.5)',
            background: 'hsl(var(--info) / 0.08)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
            <Clock size={18} style={{ color: 'hsl(var(--info))', flexShrink: 0, marginTop: '0.15rem' }} aria-hidden />
            <div>
              <p style={{ fontWeight: 600, color: 'hsl(var(--info))' }}>
                Aprovada!
              </p>
              <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.95rem' }}>
                Falta só <strong>verificar seu e-mail</strong> para publicar.{' '}
                <Link href="/app/conta" className="ubm-link">
                  Ir para verificação →
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Motivo de rejeição (CA19 — só o autor vê) ── */}
      {dor.status === 'rejeitada' && dor.motivo_rejeicao && isAutor && (
        <div
          className="ubm-machined"
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            borderColor: 'hsl(var(--destructive) / 0.5)',
            background: 'hsl(var(--destructive) / 0.05)',
          }}
          aria-live="polite"
        >
          <p className="ubm-cota" style={{ color: 'hsl(var(--destructive))', marginBottom: '0.5rem' }}>
            Motivo da Revisão
          </p>
          <p style={{ color: 'hsl(var(--foreground))', lineHeight: 1.55 }}>
            {dor.motivo_rejeicao}
          </p>
          {!enviado ? (
            <div style={{ marginTop: '1rem' }}>
              {erroEnvio && (
                <p style={{ color: 'hsl(var(--destructive))', fontSize: '0.88rem', marginBottom: '0.5rem' }} role="alert">
                  <AlertCircle size={14} aria-hidden style={{ display: 'inline', marginRight: '0.3rem' }} />
                  {erroEnvio}
                </p>
              )}
              <button
                type="button"
                className="ubm-btn ubm-btn-secondary"
                onClick={handleReenviar}
                disabled={enviando}
                style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}
              >
                <CornerUpLeft size={15} aria-hidden />
                {enviando ? 'Enviando…' : 'Corrigir e reenviar'}
              </button>
            </div>
          ) : (
            <p style={{ marginTop: '0.75rem', color: 'hsl(var(--success))', fontWeight: 600, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <CheckCircle2 size={15} aria-hidden />
              Dor reenviada para moderação.
            </p>
          )}
        </div>
      )}

      {/* ── Corpo da dor ── */}
      <div style={{ display: 'grid', gap: '2rem' }}>
        <section>
          <h2 className="ubm-cota" style={{ marginBottom: '0.75rem' }}>Descrição</h2>
          <p style={{ lineHeight: 1.7, maxWidth: '65ch', color: 'hsl(var(--foreground))' }}>
            {dor.descricao}
          </p>
        </section>

        {dor.cursos.length > 0 && (
          <section>
            <h2 className="ubm-cota" style={{ marginBottom: '0.75rem' }}>Cursos Sugeridos</h2>
            <div className="ubm-dor-card-cursos">
              {dor.cursos.map((c) => (
                <span key={c} className="ubm-dor-card-curso">{labelCurso(c)}</span>
              ))}
            </div>
          </section>
        )}

        {/* ── Timeline/equipe = peça lacrada "EM BREVE (005)" ── */}
        <section>
          <h2 className="ubm-cota" style={{ marginBottom: '0.75rem' }}>Linha do Tempo e Equipe</h2>
          <div className="ubm-locked">
            <Lock className="ubm-locked-icon" aria-hidden />
            <span className="ubm-cota">EM BREVE</span>
            <p className="ubm-locked-title">Em breve</p>
            <p className="ubm-locked-msg">
              Linha do tempo e equipe do projeto aparecerão aqui quando a dor virar projeto.
            </p>
          </div>
        </section>
      </div>
    </article>
  )
}
