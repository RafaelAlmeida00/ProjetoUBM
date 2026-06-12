'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { onboardingRepresentante } from '@/lib/actions/onboarding'
import { obterOuCriarEmpresa } from '@/lib/actions/empresa'
import { reclamarDor } from '@/lib/actions/dor'

/**
 * Chave do rascunho da dor no localStorage — mesma do wizard da landing.
 * architecture D.7 / RN25/CA27/CA28.
 */
const DRAFT_KEY = 'ubm:dor-draft'

interface DorDraft {
  tipo?: string
  nome?: string
  email?: string
  empresa?: { id?: string; nome?: string; criar?: boolean }
  departamento?: string
  cargo?: string
  // Legado — campos da dor pendente (fluxo pré-T-AN12, re-submissão)
  descricao?: string
  cursos?: string[]
  consentimento?: boolean
  consentVersion?: string
  consentAt?: string
  /** Legado: flag de idempotência antiga (re-submissão). Ignorada no fluxo novo. */
  dorSubmetida?: boolean
  /**
   * T-AN14 / E.6: ID da dor órfã já submetida anonimamente.
   * Presença indica fluxo anônimo novo → CacheSkipGate faz claim, não re-submissão.
   */
  dorId?: string
  /** Token one-shot para prova de posse (SR-B3/SR-B4) */
  claimToken?: string
}

function lerDraft(): DorDraft | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DorDraft
  } catch {
    return null
  }
}

function limparDraft() {
  try {
    if (typeof window !== 'undefined') localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* noop */
  }
}

/**
 * Valida que o draft tem os dados mínimos para algum dos dois fluxos:
 * - Fluxo novo (T-AN14): tipo=representante + dorId (claim pós-login)
 * - Fluxo legado (CA27/CA28): tipo=representante + empresa + nome (re-submissão ou só onboarding)
 */
function draftValido(d: DorDraft | null): boolean {
  if (!d) return false
  if (d.tipo !== 'representante') return false
  // Fluxo novo: só precisa do dorId
  if (d.dorId) return true
  // Fluxo legado: precisa de empresa
  if (!d.empresa || (!d.empresa.id && !d.empresa.nome)) return false
  return true
}

interface CacheSkipGateProps {
  /**
   * true  → usuário SEM identidade ainda (recém-chegado, onboarding não rodou).
   * false → já tem identidade; não fazer skip mesmo que o cache exista.
   */
  semIdentidade: boolean
  children?: React.ReactNode
}

type SkipState = 'idle' | 'loading' | 'success' | 'success-dor' | 'fallback' | 'error'

/**
 * CacheSkipGate — CA27/CA28 / RN25 / architecture D.7.
 *
 * Se o usuário acabou de logar via landing (sem identidade + draft válido no localStorage),
 * popula automaticamente a identidade de representante e pula o onboarding manual.
 *
 * Elo 2 (RN25/CA27): se o draft contiver uma dor pendente (descricao preenchida e
 * dorSubmetida != true), submete a dor automaticamente após criar a identidade e
 * exibe confirmação (CA21) com link para /app/dores/{id}.
 *
 * Fallback seguro: se cache ausente/inválido, ou se já tem identidade, renderiza `children`
 * (onboarding manual coeso). O localStorage é limpo apenas no sucesso.
 */
export function CacheSkipGate({ semIdentidade, children }: CacheSkipGateProps) {
  // Guardas síncronas resolvidas no initializer (evita setState síncrono em useEffect)
  const [state, setState] = useState<SkipState>(() => {
    if (!semIdentidade) return 'fallback'
    const draft = lerDraft()
    if (!draftValido(draft)) return 'fallback'
    return 'loading' // vai disparar o efeito assíncrono
  })
  const [dorId, setDorId] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    // Só roda para o caminho assíncrono (guardas síncronas já resolvidas no useState initializer)
    if (state !== 'loading') return
    if (ran.current) return
    ran.current = true

    void (async () => {
      try {
        // Relê o draft (initializer pode ter rodado no SSR sem window)
        const draft = lerDraft()
        if (!draftValido(draft)) {
          setState('fallback')
          return
        }

        // ── Fluxo novo T-AN14/T-B14 (ADR-004F): dorId + claimToken → claim pós-login ──
        // A prova de posse é o claim-token one-shot hasheado (0042 / F.5).
        // O jwt.email do login é irrelevante — qualquer e-mail pessoal pode reclamar.
        // Empresa diferida resolvida antes do claim e passada como parâmetro à RPC (E.3).
        if (draft!.dorId) {
          let empresaIdResolvido: string | undefined
          if (draft!.empresa?.criar && draft!.empresa?.nome) {
            const resolvida = await obterOuCriarEmpresa(draft!.empresa.nome)
            if (!resolvida.ok) {
              // CA28: fallback se empresa não pôde ser criada; dor órfã permanece admin-only
              setState('fallback')
              return
            }
            empresaIdResolvido = resolvida.empresa.id
          }

          const claimResult = await reclamarDor(draft!.dorId, draft!.claimToken ?? '', empresaIdResolvido)

          if (!claimResult.ok) {
            // CA28: token inválido/expirado ou erro → fallback onboarding coeso
            // A dor órfã permanece admin-only; admin reconcilia ou retenção expurga (SR-A10/F.7)
            setState('fallback')
            return
          }

          limparDraft()
          setDorId(draft!.dorId)
          setState('success-dor')
          return
        }

        // ── Fluxo legado (CA27/CA28): sem dorId → onboarding representante ──
        let empresaId = draft!.empresa!.id
        if (!empresaId && draft!.empresa!.nome) {
          const resolvida = await obterOuCriarEmpresa(draft!.empresa!.nome)
          if (!resolvida.ok) {
            setState('fallback')
            return
          }
          empresaId = resolvida.empresa.id
        }

        if (!empresaId) {
          setState('fallback')
          return
        }

        const result = await onboardingRepresentante({
          empresaId,
          nome: draft!.nome ?? '',
          departamento: draft!.departamento || null,
          cargo: draft!.cargo || null,
          // Fluxo legado: usa o email do cache (corporativo do form), se disponível (T-B14/F.3).
          // A RPC valida server-side; se ausente, cai no fallback de onboarding manual.
          emailCorporativo: draft!.email ?? '',
        })

        if (!result.ok) {
          setState('fallback')
          return
        }

        limparDraft()
        setState('success')
      } catch {
        // CA28: erro inesperado — mantém cache
        setState('fallback')
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Loading: mostra feedback de progresso
  if (state === 'idle' || state === 'loading') {
    return (
      <div
        className="ubm-propor"
        style={{ alignItems: 'center', justifyContent: 'center' }}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="animate-spin" aria-hidden size={24} />
        <p style={{ marginTop: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
          Preparando seu espaço…
        </p>
      </div>
    )
  }

  // Sucesso: "já preenchemos a partir da sua proposta" (CA27)
  if (state === 'success') {
    return (
      <div
        className="ubm-propor"
        style={{ alignItems: 'center', justifyContent: 'center' }}
        aria-live="polite"
      >
        <div
          className="ubm-machined"
          style={{
            width: 'min(38rem, 94vw)',
            padding: 'clamp(1.75rem, 5vw, 2.5rem)',
            textAlign: 'center',
          }}
        >
          <CheckCircle2
            size={40}
            style={{ color: 'hsl(var(--success))', marginBottom: '1rem' }}
            aria-hidden
          />
          <h1
            className="font-display"
            style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 600, marginBottom: '0.5rem' }}
          >
            Tudo pronto!
          </h1>
          <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.95rem' }}>
            Já preenchemos a partir da sua proposta.
            Sua identidade de representante foi criada automaticamente.
          </p>
          <a
            href="/app"
            className="ubm-btn ubm-btn-primary"
            style={{ display: 'inline-flex', marginTop: '1.5rem' }}
          >
            Acessar o painel
          </a>
        </div>
      </div>
    )
  }

  // Sucesso com dor submetida (CA21 / Elo 2): "Recebemos sua dor!"
  if (state === 'success-dor') {
    return (
      <div
        className="ubm-propor"
        style={{ alignItems: 'center', justifyContent: 'center' }}
        aria-live="polite"
      >
        <div
          className="ubm-machined ubm-confirmacao"
          style={{
            width: 'min(38rem, 94vw)',
            padding: 'clamp(1.75rem, 5vw, 2.5rem)',
            textAlign: 'center',
          }}
        >
          <CheckCircle2
            size={40}
            style={{ color: 'hsl(var(--success))', marginBottom: '1rem' }}
            aria-hidden
          />
          <h1
            className="font-display"
            style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 600, marginBottom: '0.5rem' }}
          >
            Recebemos sua dor!
          </h1>
          <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.95rem' }}>
            Ela está <strong>em moderação</strong> — nossa equipe vai analisar em breve.
          </p>
          <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.95rem', marginTop: '0.5rem' }}>
            Sua identidade de representante também foi criada automaticamente.
          </p>
          {dorId && (
            <a
              href={`/app/dores/${dorId}`}
              className="ubm-btn ubm-btn-secondary"
              style={{ display: 'inline-flex', marginTop: '1.5rem' }}
            >
              Ver minha dor
            </a>
          )}
          <a
            href="/app"
            className="ubm-btn ubm-btn-primary"
            style={{ display: 'inline-flex', marginTop: '0.75rem', marginLeft: '0.5rem' }}
          >
            Acessar o painel
          </a>
        </div>
      </div>
    )
  }

  // Fallback (CA28): renderiza children = onboarding manual coeso
  return <>{children}</>
}
