'use client'
/**
 * T5.1–T5.3 — SecaoProposta: visão da seção de proposta/assinatura por papel.
 * Substitui o teaser "EM BREVE · 006" em DorDetalhe.tsx.
 *
 * Papéis:
 *  - host        → T5.1 (enviar/acompanhar/iniciar/finalizar + selos)
 *  - representante → T5.2 (ver doc + 2 caminhos A/B + aviso gov.br + contraproposta)
 *  - coordenador → T5.3 (read-only: doc + estado, sem CTAs)
 *  - aluno/null  → T5.3 (peça lacrada DOCUMENTO RESTRITO)
 *  - admin       → T5.3 (vê tudo + override auditado colapsado, NUNCA assinar)
 *
 * Design: design.md §2–§6 / §8–§10 (tokens HSL, seletores declarados em globals.css).
 * a11y: WCAG AA, ESC fecha modal, foco-armadilha, aria-live.
 */

import React, { useState, useTransition, useRef, useEffect } from 'react'
import {
  Send,
  Hammer,
  Trophy,
  Lock,
  BadgeCheck,
  XCircle,
  CalendarX,
  FileClock,
  Hourglass,
  Loader,
  PenLine,
  CornerUpLeft,
  MessagesSquare,
  Download,
  Info,
  ShieldAlert,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react'
import {
  enviarProposta,
  enviarDocumentoAssinado,
  contrapropor,
  iniciarExecucao,
  finalizarProjeto,
} from '@/lib/actions/proposta'
import { useToast } from '@/components/feedback/ToastProvider'
import type { DadosProposta, EstadoProposta, StatusAssinatura } from '@/lib/data/proposta'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type PapelProposta = 'host' | 'representante' | 'coordenador' | 'admin' | 'aluno' | null

export interface SecaoPropostaProps {
  projetoId: string
  papel: PapelProposta
  dados: DadosProposta | null
  /** Nome do representante (para signatario no envio Caminho A) */
  representanteNome?: string
  representanteEmail?: string
}

// ---------------------------------------------------------------------------
// Chip de estado
// ---------------------------------------------------------------------------

interface ChipEstadoProps {
  estadoProjeto: EstadoProposta
  statusAssinatura?: StatusAssinatura | null
}

function ChipEstado({ estadoProjeto, statusAssinatura }: ChipEstadoProps) {
  if (estadoProjeto === 'aguardando_proposta') {
    return (
      <span className="ubm-proposta-estado ubm-proposta-estado--aguardando" aria-label="Estado: aguardando proposta">
        <FileClock aria-hidden="true" />
        AGUARDANDO PROPOSTA
      </span>
    )
  }
  if (estadoProjeto === 'proposta_em_analise') {
    if (statusAssinatura === 'recusada') {
      return (
        <span className="ubm-proposta-estado ubm-proposta-estado--recusada" aria-label="Estado: assinatura recusada">
          <XCircle aria-hidden="true" />
          ASSINATURA RECUSADA
        </span>
      )
    }
    if (statusAssinatura === 'expirada') {
      return (
        <span className="ubm-proposta-estado ubm-proposta-estado--expirada" aria-label="Estado: proposta expirada">
          <CalendarX aria-hidden="true" />
          PROPOSTA EXPIRADA
        </span>
      )
    }
    return (
      <span className="ubm-proposta-estado ubm-proposta-estado--pendente" aria-label="Estado: enviada, aguardando assinatura">
        <Hourglass aria-hidden="true" />
        ENVIADA · AGUARDANDO ASSINATURA
      </span>
    )
  }
  if (estadoProjeto === 'proposta_aprovada') {
    return (
      <span className="ubm-proposta-estado ubm-proposta-estado--selada" aria-label="Estado: proposta selada">
        <BadgeCheck aria-hidden="true" />
        PROPOSTA SELADA
      </span>
    )
  }
  if (estadoProjeto === 'em_execucao') {
    return (
      <span className="ubm-proposta-estado ubm-proposta-estado--execucao" aria-label="Estado: em execução">
        <Hammer aria-hidden="true" />
        EM EXECUÇÃO
      </span>
    )
  }
  if (estadoProjeto === 'finalizado') {
    return (
      <span className="ubm-proposta-estado ubm-proposta-estado--finalizado" aria-label="Estado: finalizado">
        <Trophy aria-hidden="true" />
        FINALIZADO
      </span>
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Modal de loader comunicante (selo de envio §3.5a)
// ---------------------------------------------------------------------------

function ModalSelo({ msg }: { msg: string }) {
  return (
    <div className="ubm-modal-overlay" role="dialog" aria-modal="true" aria-label="Processando">
      <div className="ubm-modal ubm-machined">
        <div className="ubm-loader">
          <p className="ubm-loader-msg">{msg}</p>
          <div className="ubm-sk-status">
            <div className="ubm-sk-dots" aria-hidden="true">
              <span /><span /><span />
            </div>
            <span style={{ fontSize: '0.82rem', color: 'hsl(var(--muted-foreground))' }}>
              preparando a assinatura segura
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de confirmação de contraproposta (§3.6)
// ---------------------------------------------------------------------------

interface ModalContrapropProps {
  projetoId: string
  provedorDocId?: string | null
  origem?: 'autentique' | 'upload_livre' | null
  onClose: () => void
  onSuccess: () => void
}

function ModalContraprop({
  projetoId,
  provedorDocId,
  origem,
  onClose,
  onSuccess,
}: ModalContrapropProps) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [isPending, startTransition] = useTransition()
  const toast = useToast()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // foco-armadilha: foca o textarea ao abrir
  useEffect(() => { textareaRef.current?.focus() }, [])

  // ESC fecha
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleEnviar = () => {
    if (!motivo.trim()) {
      setErro('O motivo é obrigatório para contrapropor.')
      return
    }
    startTransition(async () => {
      const res = await contrapropor({
        projetoId,
        motivo: motivo.trim(),
        provedorDocId: provedorDocId ?? undefined,
        origem: origem ?? undefined,
      })
      if (res.ok) {
        toast.sucesso('Contraproposta enviada — a bola volta ao host.')
        onSuccess()
        onClose()
      } else {
        toast.erro(res.error || 'Não foi possível enviar a contraproposta.')
      }
    })
  }

  return (
    <div className="ubm-modal-overlay" role="dialog" aria-modal="true" aria-label="Contraproposta">
      <div className="ubm-modal ubm-machined">
        <div className="ubm-confirm">
          <h2 className="ubm-confirm-title">Devolver com motivo</h2>
          <p className="ubm-confirm-msg">
            Explique o que precisa mudar. O host receberá o motivo e poderá reenviar.
          </p>
          <div className="ubm-confirm-field">
            <label htmlFor="motivo-contraprop" className="ubm-field-label">
              Motivo <span className="ubm-req" aria-hidden="true">*</span>
            </label>
            <textarea
              id="motivo-contraprop"
              ref={textareaRef}
              value={motivo}
              onChange={(e) => { setMotivo(e.target.value); setErro('') }}
              aria-required="true"
              aria-invalid={!!erro}
              aria-describedby={erro ? 'motivo-erro' : undefined}
              rows={4}
              placeholder="Descreva o que precisa ser ajustado na proposta…"
              disabled={isPending}
            />
            {erro && (
              <p id="motivo-erro" className="ubm-field-error" role="alert">
                <AlertTriangle aria-hidden="true" />
                {erro}
              </p>
            )}
          </div>
          <p className="ubm-confirm-required">* Campo obrigatório</p>
          <div className="ubm-confirm-actions">
            <button
              type="button"
              className="ubm-btn ubm-btn-ghost"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="ubm-btn ubm-btn-accent"
              onClick={handleEnviar}
              disabled={isPending}
            >
              <CornerUpLeft aria-hidden="true" />
              Devolver com motivo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de finalizar projeto (confirmação)
// ---------------------------------------------------------------------------

interface ModalFinalizarProps {
  projetoId: string
  onClose: () => void
}

function ModalFinalizar({ projetoId, onClose }: ModalFinalizarProps) {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleFinalizar = () => {
    startTransition(async () => {
      const res = await finalizarProjeto(projetoId)
      if (res.ok) {
        toast.sucesso('Projeto finalizado. O caso aparece na vitrine.')
        onClose()
      } else {
        toast.erro(res.error || 'Não foi possível finalizar o projeto.')
        onClose()
      }
    })
  }

  return (
    <div className="ubm-modal-overlay" role="dialog" aria-modal="true" aria-label="Finalizar projeto">
      <div className="ubm-modal ubm-machined">
        <div className="ubm-confirm">
          <h2 className="ubm-confirm-title">Finalizar o projeto?</h2>
          <p className="ubm-confirm-msg">
            Concluir e enviar à vitrine de casos? Esta ação é permanente.
          </p>
          <div className="ubm-confirm-actions">
            <button type="button" className="ubm-btn ubm-btn-ghost" onClick={onClose} disabled={isPending}>
              Cancelar
            </button>
            <button type="button" className="ubm-btn ubm-btn-primary" onClick={handleFinalizar} disabled={isPending}>
              <Trophy aria-hidden="true" />
              Finalizar projeto
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Visão HOST (T5.1)
// ---------------------------------------------------------------------------

function VisaoHost({
  projetoId,
  dados,
  representanteNome = '',
  representanteEmail = '',
}: {
  projetoId: string
  dados: DadosProposta
  representanteNome?: string
  representanteEmail?: string
}) {
  const [pdf, setPdf] = useState<File | null>(null)
  const [consentido, setConsentido] = useState(false)
  const [erroPdf, setErroPdf] = useState('')
  const [erroConsent, setErroConsent] = useState('')
  const [isPending, startTransition] = useTransition()
  const [mostrarSelo, setMostrarSelo] = useState(false)
  const [modalFinalizar, setModalFinalizar] = useState(false)
  const toast = useToast()

  const { estadoProjeto, documentoSignedUrl, provaSignedUrl, statusAssinatura, contraproposta, nRodadas = 0 } = dados
  const loopAlerta = nRodadas >= 3

  const handleEnviar = () => {
    if (!pdf) { setErroPdf('Selecione um PDF para enviar.'); return }
    if (!consentido) { setErroConsent('Confirme o aceite do meio eletrônico para continuar.'); return }
    setMostrarSelo(true)
    startTransition(async () => {
      const documentoId = crypto.randomUUID()
      const res = await enviarProposta({
        projetoId,
        documentoId,
        signatario: { nome: representanteNome, email: representanteEmail },
        pdf,
      })
      setMostrarSelo(false)
      if (res.ok) {
        toast.sucesso('Proposta enviada para assinatura.')
      } else {
        toast.erro(res.error || 'Não foi possível enviar a proposta.')
      }
    })
  }

  const handleIniciar = () => {
    startTransition(async () => {
      const res = await iniciarExecucao(projetoId)
      if (res.ok) {
        toast.sucesso('Execução iniciada.')
      } else {
        toast.erro(res.error || 'Não foi possível iniciar a execução.')
      }
    })
  }

  return (
    <>
      {mostrarSelo && <ModalSelo msg="Selando o documento…" />}
      {modalFinalizar && (
        <ModalFinalizar projetoId={projetoId} onClose={() => setModalFinalizar(false)} />
      )}

      {/* Alerta de loop (≥3 rodadas) */}
      {loopAlerta && (
        <div
          className="ubm-dropzone-pii ubm-aviso--loop"
          role="status"
          aria-live="polite"
          data-testid="alerta-loop"
        >
          <MessagesSquare aria-hidden="true" />
          <span>
            Vocês já trocaram algumas versões. Que tal alinhar fora do fluxo automático antes de reenviar?
            Você ainda pode reenviar normalmente.
          </span>
        </div>
      )}

      {/* Estado: aguardando_proposta → enviar */}
      {estadoProjeto === 'aguardando_proposta' && (
        <div className="ubm-proposta-acoes" data-testid="zona-enviar">
          {/* Motivo da contraproposta (quando o rep devolveu) — o host precisa saber o porquê */}
          {contraproposta && (
            <div
              className="ubm-machined"
              role="status"
              aria-live="polite"
              data-testid="contraproposta-motivo"
              style={{
                padding: '1rem 1.25rem',
                marginBottom: '1rem',
                borderColor: 'hsl(var(--warning) / 0.6)',
                background: 'hsl(var(--warning) / 0.08)',
              }}
            >
              <p
                className="ubm-cota"
                style={{ color: 'hsl(var(--warning))', marginBottom: '0.35rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}
              >
                <CornerUpLeft size={15} aria-hidden="true" />
                Contraproposta recebida — ajuste e reenvie
              </p>
              <p style={{ color: 'hsl(var(--foreground))', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {contraproposta.motivo}
              </p>
            </div>
          )}
          <label className="ubm-dropzone" htmlFor="pdf-proposta">
            <span className="ubm-dropzone-cta">
              <b>Selecionar PDF</b> ou arraste aqui
            </span>
            <span className="ubm-dropzone-limits">Somente PDF · máximo 10 MB</span>
            {pdf && (
              <span className="ubm-cota ubm-cota--muted" aria-live="polite">
                {pdf.name}
              </span>
            )}
            <input
              id="pdf-proposta"
              type="file"
              accept="application/pdf"
              aria-label="Selecionar arquivo PDF da proposta"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setPdf(f)
                setErroPdf('')
              }}
            />
          </label>
          {erroPdf && (
            <p className="ubm-dropzone-error" role="alert" data-testid="erro-pdf">
              {erroPdf}
            </p>
          )}

          {/* Cláusula de aceite do meio eletrônico (RN6) */}
          <label className="ubm-consent-label" data-testid="clausula-aceite">
            <input
              type="checkbox"
              checked={consentido}
              onChange={(e) => { setConsentido(e.target.checked); setErroConsent('') }}
              aria-required="true"
            />
            As partes declaram que aceitam assinar por meio eletrônico, conferindo plena validade
            jurídica ao presente documento, conforme a Lei 14.063/2020.
          </label>
          {erroConsent && (
            <p className="ubm-field-error" role="alert" data-testid="erro-consent">
              <AlertTriangle aria-hidden="true" />
              {erroConsent}
            </p>
          )}

          <button
            type="button"
            className="ubm-btn ubm-btn-primary"
            onClick={handleEnviar}
            disabled={isPending}
            aria-label="Enviar proposta para assinatura"
          >
            <Send aria-hidden="true" />
            Enviar para assinatura
          </button>
        </div>
      )}

      {/* Estado: proposta_em_analise → acompanhar/reenviar */}
      {estadoProjeto === 'proposta_em_analise' && (
        <div data-testid="zona-pendente">
          <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.95rem' }}>
            {statusAssinatura === 'recusada'
              ? 'O representante recusou a assinatura. Você pode reenviar.'
              : statusAssinatura === 'expirada'
              ? 'Esta proposta expirou. Reenvie quando quiser.'
              : 'Aguardando o representante assinar.'}
          </p>
          {(statusAssinatura === 'recusada' || statusAssinatura === 'expirada') && (
            <button
              type="button"
              className="ubm-btn ubm-btn-secondary"
              aria-label="Reenviar proposta"
              data-testid="btn-reenviar"
              onClick={() => toast.info('Selecione um novo PDF para reenviar a proposta.')}
            >
              <Send aria-hidden="true" />
              Reenviar proposta
            </button>
          )}
        </div>
      )}

      {/* Estado: proposta_aprovada → stamp + prova + iniciar execução */}
      {estadoProjeto === 'proposta_aprovada' && (
        <div data-testid="zona-aprovada">
          <span className="ubm-stamp" aria-label="Proposta selada">
            <BadgeCheck aria-hidden="true" />
            PROPOSTA SELADA
          </span>
          {provaSignedUrl && (
            <div className="ubm-proposta-doc" style={{ marginTop: '0.75rem' }}>
              <a
                href={provaSignedUrl}
                className="ubm-btn ubm-btn-secondary"
                download
                aria-label="Baixar prova de assinatura (PDF)"
              >
                <Download aria-hidden="true" />
                Baixar prova
              </a>
            </div>
          )}
          <div className="ubm-proposta-acoes" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="ubm-btn ubm-btn-primary"
              onClick={handleIniciar}
              disabled={isPending}
              aria-label="Iniciar execução do projeto"
              data-testid="btn-iniciar"
            >
              <Hammer aria-hidden="true" />
              Iniciar execução
            </button>
          </div>
        </div>
      )}

      {/* Estado: em_execucao → finalizar */}
      {estadoProjeto === 'em_execucao' && (
        <div data-testid="zona-execucao">
          <div className="ubm-proposta-acoes">
            <button
              type="button"
              className="ubm-btn ubm-btn-primary"
              onClick={() => setModalFinalizar(true)}
              disabled={isPending}
              aria-label="Finalizar o projeto"
              data-testid="btn-finalizar"
            >
              <Trophy aria-hidden="true" />
              Finalizar projeto
            </button>
          </div>
        </div>
      )}

      {/* Estado: finalizado → stamp */}
      {estadoProjeto === 'finalizado' && (
        <div data-testid="zona-finalizado">
          <span className="ubm-stamp" aria-label="Projeto finalizado">
            <Trophy aria-hidden="true" />
            FINALIZADO
          </span>
          <p style={{ marginTop: '0.5rem', fontSize: '0.92rem', color: 'hsl(var(--muted-foreground))' }}>
            Este caso está concluído e aparece na vitrine.
          </p>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Visão REPRESENTANTE (T5.2)
// ---------------------------------------------------------------------------

function VisaoRepresentante({
  projetoId,
  dados,
}: {
  projetoId: string
  dados: DadosProposta
}) {
  const {
    estadoProjeto,
    documentoId,
    documentoSignedUrl,
    provaSignedUrl,
    statusAssinatura,
    linkAssinatura,
    provedorDocId,
    origemAssinatura,
  } = dados

  const [modalContraprop, setModalContraprop] = useState(false)
  const [pdfAssinado, setPdfAssinado] = useState<File | null>(null)
  const [erroPdf, setErroPdf] = useState('')
  const [isPending, startTransition] = useTransition()
  const [mostrarSelo, setMostrarSelo] = useState(false)
  const toast = useToast()

  // Apenas ativo em proposta_em_analise (pendente/enviada)
  const podeAgir =
    estadoProjeto === 'proposta_em_analise' &&
    statusAssinatura !== 'recusada' &&
    statusAssinatura !== 'expirada'

  const handleUploadAssinado = () => {
    if (!pdfAssinado) { setErroPdf('Selecione o PDF assinado.'); return }
    if (pdfAssinado.type !== 'application/pdf') { setErroPdf('Apenas arquivos PDF são aceitos.'); return }
    if (!documentoId) { setErroPdf('Documento não encontrado.'); return }
    setMostrarSelo(true)
    startTransition(async () => {
      const res = await enviarDocumentoAssinado({
        projetoId,
        documentoId,
        pdfAssinado,
      })
      setMostrarSelo(false)
      if (res.ok) {
        toast.sucesso('Documento assinado enviado. Proposta confirmada.')
      } else {
        toast.erro(res.error || 'Não foi possível enviar o documento.')
      }
    })
  }

  return (
    <>
      {mostrarSelo && <ModalSelo msg="Guardando sua prova com segurança…" />}
      {modalContraprop && (
        <ModalContraprop
          projetoId={projetoId}
          provedorDocId={provedorDocId}
          origem={origemAssinatura}
          onClose={() => setModalContraprop(false)}
          onSuccess={() => setModalContraprop(false)}
        />
      )}

      {/* Ver documento original */}
      {documentoSignedUrl && (
        <div className="ubm-proposta-doc" data-testid="ver-documento">
          <a
            href={documentoSignedUrl}
            className="ubm-btn ubm-btn-secondary"
            download
            aria-label="Baixar documento da proposta (PDF) — abre em nova aba"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download aria-hidden="true" />
            Ver proposta (PDF)
          </a>
        </div>
      )}

      {/* Prova (pós-aprovação) */}
      {estadoProjeto === 'proposta_aprovada' && provaSignedUrl && (
        <div className="ubm-proposta-doc" data-testid="prova-aprovada">
          <span className="ubm-stamp" aria-label="Proposta selada">
            <BadgeCheck aria-hidden="true" />
            PROPOSTA SELADA
          </span>
          <a
            href={provaSignedUrl}
            className="ubm-btn ubm-btn-secondary"
            download
            aria-label="Baixar prova de assinatura"
          >
            <Download aria-hidden="true" />
            Baixar prova
          </a>
        </div>
      )}

      {/* Estados não-ativo */}
      {!podeAgir && estadoProjeto === 'proposta_em_analise' && (
        <p
          style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.92rem' }}
          data-testid="msg-inativa"
          aria-live="polite"
        >
          {statusAssinatura === 'recusada' || statusAssinatura === 'expirada'
            ? 'Esta proposta não está mais ativa; aguarde o host reenviar.'
            : 'Recebemos; o sistema confirma automaticamente.'}
        </p>
      )}

      {/* Dois caminhos A/B — só quando pode agir */}
      {podeAgir && (
        <div className="ubm-caminhos" data-testid="caminhos-assinatura">
          {/* Caminho A — Autentique */}
          <div className="ubm-caminho" data-testid="caminho-a">
            <span className="ubm-caminho-rotulo">CAMINHO A · AUTOMÁTICO</span>
            <span className="ubm-caminho-titulo">Assinar via Autentique</span>
            <span className="ubm-caminho-desc">
              Você assina no Autentique; a UBM confirma sozinha e sela a proposta.
            </span>
            {linkAssinatura ? (
              <a
                href={linkAssinatura}
                target="_blank"
                rel="noopener noreferrer"
                className="ubm-btn ubm-btn-accent"
                aria-label="Assinar via Autentique — abre em nova aba"
              >
                <PenLine aria-hidden="true" />
                Assinar via Autentique
                <ExternalLink aria-hidden="true" style={{ width: '0.85rem', height: '0.85rem' }} />
              </a>
            ) : (
              <span
                className="ubm-cota ubm-cota--muted"
                style={{ fontSize: '0.8rem' }}
                data-testid="autentique-pendente"
              >
                O link de assinatura foi enviado ao seu e-mail pelo Autentique — verifique sua caixa de entrada (e o spam).
              </span>
            )}
          </div>

          {/* Caminho B — Upload livre com aviso pró-gov.br */}
          <div className="ubm-caminho" data-testid="caminho-b">
            <span className="ubm-caminho-rotulo">CAMINHO B · ENVIO LIVRE</span>
            <span className="ubm-caminho-titulo">Enviar documento assinado</span>
            <span className="ubm-caminho-desc">
              Assine por meios próprios e envie o PDF assinado de volta.
            </span>

            {/* Aviso pró-gov.br (RN7c) */}
            <div className="ubm-govbr-aviso" data-testid="aviso-govbr">
              <Info aria-hidden="true" />
              <span>
                Recomendamos assinar pelo{' '}
                <strong>gov.br</strong> — assinador eletrônico gratuito e de alta credibilidade
                institucional, ideal para órgãos públicos. Depois de assinar, valide e envie o PDF
                aqui.{' '}
                <a
                  href="https://www.gov.br/governodigital/pt-br/assinatura-eletronica"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Assinar no gov.br — abre em nova aba"
                >
                  Assinar no gov.br ↗
                </a>{' '}
                ·{' '}
                <a
                  href="https://validar.iti.gov.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Validar documento em validar.gov.br — abre em nova aba"
                >
                  Validar documento em validar.gov.br ↗
                </a>
              </span>
            </div>

            {/* Dropzone para PDF assinado */}
            <label className="ubm-dropzone" htmlFor="pdf-assinado">
              <span className="ubm-dropzone-cta">
                <b>Selecionar PDF assinado</b> ou arraste aqui
              </span>
              <span className="ubm-dropzone-limits">Somente PDF · máximo 10 MB</span>
              {pdfAssinado && (
                <span className="ubm-cota ubm-cota--muted" aria-live="polite">
                  {pdfAssinado.name}
                </span>
              )}
              <input
                id="pdf-assinado"
                type="file"
                accept="application/pdf"
                aria-label="Selecionar PDF assinado"
                data-testid="input-pdf-assinado"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setPdfAssinado(f)
                  setErroPdf('')
                  if (f && f.type !== 'application/pdf') {
                    setErroPdf('Apenas arquivos PDF são aceitos.')
                  }
                }}
              />
            </label>
            {erroPdf && (
              <p className="ubm-dropzone-error" role="alert" data-testid="erro-pdf-assinado">
                {erroPdf}
              </p>
            )}
            <button
              type="button"
              className="ubm-btn ubm-btn-accent"
              onClick={handleUploadAssinado}
              disabled={isPending || !pdfAssinado}
              aria-label="Enviar documento assinado"
              data-testid="btn-enviar-assinado"
            >
              <Send aria-hidden="true" />
              Enviar documento assinado
            </button>
          </div>
        </div>
      )}

      {/* Contraproposta (separador + CTA) — só quando pode agir */}
      {podeAgir && (
        <>
          <hr style={{ border: 'none', borderTop: '1px dashed hsl(var(--border))' }} />
          <div className="ubm-proposta-acoes">
            <button
              type="button"
              className="ubm-btn ubm-btn-accent"
              onClick={() => setModalContraprop(true)}
              aria-label="Contrapropor — abrir modal"
              data-testid="btn-contrapropor"
            >
              <CornerUpLeft aria-hidden="true" />
              Contrapropor
            </button>
          </div>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Visão CO-COORDENADOR (T5.3 — read-only)
// ---------------------------------------------------------------------------

function VisaoCoCoordenador({ dados }: { dados: DadosProposta }) {
  const { documentoSignedUrl, provaSignedUrl, estadoProjeto, statusAssinatura } = dados
  return (
    <>
      <p
        className="ubm-cota ubm-cota--muted"
        style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}
        data-testid="msg-coord"
      >
        Acompanhamento — ações de proposta cabem ao host; assinatura, ao representante.
      </p>
      {documentoSignedUrl && (
        <div className="ubm-proposta-doc" data-testid="doc-coord">
          <a
            href={documentoSignedUrl}
            className="ubm-btn ubm-btn-secondary"
            download
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Baixar documento da proposta"
          >
            <Download aria-hidden="true" />
            Ver proposta (PDF)
          </a>
        </div>
      )}
      {provaSignedUrl && estadoProjeto === 'proposta_aprovada' && (
        <div className="ubm-proposta-doc" data-testid="prova-coord">
          <a
            href={provaSignedUrl}
            className="ubm-btn ubm-btn-secondary"
            download
            aria-label="Baixar prova de assinatura"
          >
            <Download aria-hidden="true" />
            Baixar prova
          </a>
        </div>
      )}
      <ChipEstado estadoProjeto={estadoProjeto} statusAssinatura={statusAssinatura} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Visão ALUNO / TERCEIRO (T5.3 — peça lacrada)
// ---------------------------------------------------------------------------

function VisaoAluno() {
  return (
    <div
      className="ubm-locked"
      aria-label="Documento restrito"
      data-testid="peca-lacrada"
    >
      <Lock className="ubm-locked-icon" aria-hidden="true" />
      <span className="ubm-cota ubm-cota--muted">DOCUMENTO RESTRITO</span>
      <span className="ubm-locked-title">Negociação reservada</span>
      <p className="ubm-locked-msg">
        Esta etapa é confidencial. O documento e a negociação ficam entre a coordenação do
        projeto, o representante da empresa e a UBM. Acompanhe o avanço pela linha do tempo.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Visão ADMIN (T5.3 — vê tudo + override auditado, NUNCA assinar)
// ---------------------------------------------------------------------------

function VisaoAdmin({
  projetoId,
  dados,
}: {
  projetoId: string
  dados: DadosProposta
}) {
  const {
    estadoProjeto,
    documentoId,
    documentoSignedUrl,
    provaSignedUrl,
    statusAssinatura,
    origemAssinatura,
    contraproposta,
    nRodadas = 0,
  } = dados

  const [overrideAberto, setOverrideAberto] = useState(false)
  const [motivoOverride, setMotivoOverride] = useState('')
  const [pdfOverride, setPdfOverride] = useState<File | null>(null)
  const [erroOverride, setErroOverride] = useState('')
  const [isPending, startTransition] = useTransition()
  const [mostrarSelo, setMostrarSelo] = useState(false)
  const toast = useToast()

  const handleAnexarProva = () => {
    if (!motivoOverride.trim()) { setErroOverride('Motivo é obrigatório para override.'); return }
    if (!pdfOverride) { setErroOverride('Selecione o PDF da prova.'); return }
    if (!documentoId) { setErroOverride('Documento não encontrado.'); return }
    setMostrarSelo(true)
    startTransition(async () => {
      const res = await enviarDocumentoAssinado({
        projetoId,
        documentoId,
        pdfAssinado: pdfOverride,
      })
      setMostrarSelo(false)
      if (res.ok) {
        toast.sucesso('Prova anexada via override auditado.')
        setOverrideAberto(false)
      } else {
        toast.erro(res.error || 'Erro ao anexar prova.')
      }
    })
  }

  return (
    <>
      {mostrarSelo && <ModalSelo msg="Guardando prova via override auditado…" />}

      {/* Admin vê tudo: doc + estado + prova + motivo de contraproposta */}
      {documentoSignedUrl && (
        <div className="ubm-proposta-doc" data-testid="doc-admin">
          <a
            href={documentoSignedUrl}
            className="ubm-btn ubm-btn-secondary"
            download
            aria-label="Baixar documento da proposta"
          >
            <Download aria-hidden="true" />
            Ver proposta (PDF)
          </a>
        </div>
      )}

      {provaSignedUrl && (
        <div className="ubm-proposta-doc" data-testid="prova-admin">
          <a href={provaSignedUrl} className="ubm-btn ubm-btn-secondary" download aria-label="Baixar prova">
            <Download aria-hidden="true" />
            Baixar prova
          </a>
          {origemAssinatura && (
            <span className="ubm-prova-origem">
              {origemAssinatura === 'autentique'
                ? 'VIA AUTENTIQUE · ASSINATURA AVANÇADA'
                : 'ENVIO LIVRE · VALIDE EM VALIDAR.GOV.BR'}
            </span>
          )}
        </div>
      )}

      <ChipEstado estadoProjeto={estadoProjeto} statusAssinatura={statusAssinatura} />

      {contraproposta && (
        <div
          className="ubm-dropzone-pii"
          style={{ marginTop: '0.5rem' }}
          data-testid="motivo-contraproposta-admin"
          aria-live="polite"
        >
          <ShieldAlert aria-hidden="true" />
          <span>
            <strong>Contraproposta:</strong> {contraproposta.motivo}
          </span>
        </div>
      )}

      {nRodadas >= 3 && (
        <div className="ubm-dropzone-pii ubm-aviso--loop" data-testid="alerta-loop-admin">
          <MessagesSquare aria-hidden="true" />
          <span>
            {nRodadas} rodadas de negociação. Considere mediar fora do fluxo.
          </span>
        </div>
      )}

      {/* Override auditado — colapsado (CA26, RN23) — NUNCA botão assinar (D5) */}
      <details
        className="ubm-gestao-zona"
        open={overrideAberto}
        onToggle={(e) => setOverrideAberto((e.currentTarget as HTMLDetailsElement).open)}
        data-testid="override-admin"
      >
        <summary className="ubm-gestao-summary">
          <span className="ubm-cota" style={{ color: 'hsl(var(--accent))' }}>
            OVERRIDE AUDITADO
          </span>
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '0.75rem' }}>
          <p style={{ fontSize: '0.88rem', color: 'hsl(var(--muted-foreground))' }}>
            Ações de correção de estado. Toda intervenção é auditada. O admin não assina pela empresa (D5).
          </p>

          {/* Anexar prova (CA26): disponível quando representante assinou fora do app */}
          <div className="ubm-field">
            <label htmlFor="motivo-override" className="ubm-field-label">
              Motivo do override <span className="ubm-req" aria-hidden="true">*</span>
            </label>
            <textarea
              id="motivo-override"
              value={motivoOverride}
              onChange={(e) => { setMotivoOverride(e.target.value); setErroOverride('') }}
              rows={2}
              placeholder="Descreva o motivo da intervenção…"
              aria-required="true"
              disabled={isPending}
              style={{ width: '100%', padding: '0.6rem', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical' }}
            />
          </div>

          <label className="ubm-dropzone" htmlFor="pdf-override" style={{ maxWidth: '28rem' }}>
            <span className="ubm-dropzone-cta"><b>Anexar prova (PDF)</b></span>
            <span className="ubm-dropzone-limits">Somente PDF · CA26</span>
            {pdfOverride && <span className="ubm-cota ubm-cota--muted">{pdfOverride.name}</span>}
            <input
              id="pdf-override"
              type="file"
              accept="application/pdf"
              aria-label="Selecionar PDF para override"
              data-testid="input-pdf-override"
              onChange={(e) => {
                setPdfOverride(e.target.files?.[0] ?? null)
                setErroOverride('')
              }}
            />
          </label>

          {erroOverride && (
            <p className="ubm-field-error" role="alert">
              <AlertTriangle aria-hidden="true" />
              {erroOverride}
            </p>
          )}

          <button
            type="button"
            className="ubm-btn ubm-btn-secondary"
            style={{ borderColor: 'hsl(var(--accent))', alignSelf: 'flex-start' }}
            onClick={handleAnexarProva}
            disabled={isPending}
            aria-label="Anexar prova via override auditado"
            data-testid="btn-anexar-prova"
          >
            <ShieldAlert aria-hidden="true" />
            Anexar prova (override)
          </button>
        </div>
      </details>

      <footer className="ubm-proposta-foot">
        <span className="ubm-cota ubm-cota--muted">
          Documento privado · acesso ampliado para administração (auditado)
        </span>
      </footer>
    </>
  )
}

// ---------------------------------------------------------------------------
// SecaoProposta — componente principal (T5.4)
// ---------------------------------------------------------------------------

export function SecaoProposta({
  projetoId,
  papel,
  dados,
  representanteNome,
  representanteEmail,
}: SecaoPropostaProps) {
  // Se não há dados e o papel é aluno/null → peça lacrada
  const estadoProjeto = dados?.estadoProjeto ?? 'aguardando_proposta'

  const renderCorpo = () => {
    // Aluno ou sem papel: sempre peça lacrada
    if (!papel || papel === 'aluno') {
      return <VisaoAluno />
    }

    // Host
    if (papel === 'host') {
      return (
        <VisaoHost
          projetoId={projetoId}
          dados={dados ?? { estadoProjeto }}
          representanteNome={representanteNome}
          representanteEmail={representanteEmail}
        />
      )
    }

    // Representante
    if (papel === 'representante') {
      return (
        <VisaoRepresentante
          projetoId={projetoId}
          dados={dados ?? { estadoProjeto }}
        />
      )
    }

    // Coordenador (co-coordenador)
    if (papel === 'coordenador') {
      return <VisaoCoCoordenador dados={dados ?? { estadoProjeto }} />
    }

    // Admin
    if (papel === 'admin') {
      return (
        <VisaoAdmin
          projetoId={projetoId}
          dados={dados ?? { estadoProjeto }}
        />
      )
    }

    return <VisaoAluno />
  }

  return (
    <section className="ubm-section-block" aria-label="Proposta e assinatura" data-testid="secao-proposta">
      <h2 className="ubm-section-title">Proposta e assinatura</h2>

      <div className="ubm-proposta" data-testid="proposta-peca">
        {/* Header: chip de estado */}
        {dados && papel !== 'aluno' && papel !== null && (
          <header className="ubm-proposta-head">
            <span className="ubm-proposta-titulo">Proposta de projeto de extensão</span>
            <ChipEstado estadoProjeto={estadoProjeto} statusAssinatura={dados.statusAssinatura} />
          </header>
        )}

        {renderCorpo()}
      </div>
    </section>
  )
}
