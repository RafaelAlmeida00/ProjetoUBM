'use client'
import { useState, useId } from 'react'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { EmpresaCombobox, isSentinel } from '@/components/empresa/EmpresaCombobox'
import { CourseMultiSelect } from '@/components/course/CourseMultiSelect'
import { ConsentGate } from '@/components/consent/ConsentGate'
import { submeterDorLanding, submeterDorLandingAnon } from '@/lib/actions/dor'
import { createSupabaseBrowserClient, temSupabaseNoCliente } from '@/lib/supabase/client'
import type { EmpresaResult } from '@/lib/actions/empresa'
import type { CursoUbm } from '@/lib/courses'

/**
 * Provedores de e-mail genéricos que NÃO são corporativos (CA23).
 * Lista de domínios públicos conhecidos.
 */
const PROVEDORES_GENERICOS = [
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.com.br',
  'outlook.com', 'outlook.com.br',
  'yahoo.com', 'yahoo.com.br',
  'icloud.com', 'me.com', 'mac.com',
  'live.com', 'live.com.br',
  'uol.com.br', 'bol.com.br', 'terra.com.br',
  'ig.com.br', 'r7.com',
]

function isEmailCorporativo(email: string): boolean {
  const dominio = email.split('@')[1]?.toLowerCase()
  if (!dominio) return false
  return !PROVEDORES_GENERICOS.includes(dominio)
}

type Step = 'email' | 'empresa' | 'descricao' | 'cursos' | 'consent' | 'submit' | 'confirmacao'

interface ProporSubmitFormProps {
  /** Permite saltar diretamente para um passo (útil nos testes) */
  initialStep?: Step
  /** Estado pré-preenchido (testes / retomar sessão) */
  empresaId?: string
  empresaNome?: string
  descricao?: string
  consentido?: boolean
}

export function ProporSubmitForm({
  initialStep = 'email',
  empresaId,
  empresaNome,
  descricao: descricaoInicial,
  consentido = false,
}: ProporSubmitFormProps) {
  const formId = useId()

  const [step, setStep] = useState<Step>(initialStep)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [empresa, setEmpresa] = useState<EmpresaResult | null>(
    empresaId && empresaNome ? { id: empresaId, nome: empresaNome } : null,
  )
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState(descricaoInicial ?? '')
  const [cursos, setCursos] = useState<CursoUbm[]>([])
  const [consent, setConsent] = useState(consentido)
  const [loading, setLoading] = useState(false)
  const [loaderMsg, setLoaderMsg] = useState('Encaixando sua dor…')
  const [errorMsg, setErrorMsg] = useState('')
  const [dorId, setDorId] = useState('')

  /* ── Passo 1: validação de e-mail corporativo ── */
  const handleEmailContinuar = () => {
    if (!isEmailCorporativo(email)) {
      setEmailError(
        'Para propor como representante, use o e-mail corporativo da sua empresa.',
      )
      return
    }
    setEmailError('')
    setStep('empresa')
  }

  /* ── Submit real ── */
  // empresa válida = id real OU sentinel de criação (CA26/RN26)
  const empresaValida = !!empresa && (!!empresa.id || empresa.criar === true)
  const podeEnviar =
    empresaValida &&
    descricao.trim().length >= 10 &&
    consent

  const handleSubmit = async () => {
    if (!podeEnviar) return
    setLoading(true)
    setErrorMsg('')

    // ── T-AN12/RN16: verifica sessão — caminho anônimo envia a dor ANTES do login ──
    // Sem sessão → submete a dor anonimamente (cria órfã em_moderacao),
    // guarda dorId no cache para o CacheSkipGate reclamar após OAuth (E.6).
    if (temSupabaseNoCliente()) {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // Mensagens escalonadas do loader comunicante
        const msgs = ['Enviando sua dor…', 'Aguardando confirmação…', 'Quase lá…']
        let msgIdx = 0
        setLoaderMsg(msgs[0])
        const msgTimer = setInterval(() => {
          msgIdx = Math.min(msgIdx + 1, msgs.length - 1)
          setLoaderMsg(msgs[msgIdx])
        }, 1200)

        const consentAt = new Date().toISOString()
        const result = await submeterDorLandingAnon({
          empresaId: isSentinel(empresa) ? null : (empresa!.id || null),
          empresaNome: isSentinel(empresa) ? empresa!.nome : null,
          titulo: titulo.trim() || undefined,
          descricao: descricao.trim(),
          repNome: email.split('@')[0] ?? 'Representante',
          email,
          consentimento: consent,
          consentVersion: '1.0',
          consentAt,
          cursos: cursos.length > 0 ? cursos : undefined,
        })

        clearInterval(msgTimer)

        if (!result.ok) {
          setLoading(false)
          setErrorMsg(result.error)
          return
        }

        // Guarda dorId + claimToken no cache para o CacheSkipGate reclamar pós-login (E.6 / T-AN14)
        // Salva também nome/empresa para o onboarding_representante no claim
        try {
          const dorDraft = {
            tipo: 'representante',
            nome: email.split('@')[0] ?? 'Representante',
            email,
            empresa: isSentinel(empresa)
              ? { nome: empresa!.nome, criar: true }
              : { id: empresa!.id, nome: empresa!.nome },
            // Idempotência: dorId presente = claim, não re-submissão (T-AN14)
            dorId: result.dorId,
            claimToken: result.claimToken,
          }
          localStorage.setItem('ubm:dor-draft', JSON.stringify(dorDraft))
        } catch {
          // localStorage indisponível — continua sem cache (fallback no CacheSkipGate)
        }

        setLoading(false)
        // Redireciona ao login Google; CacheSkipGate faz o claim pós-login
        const redirectTo = `${window.location.origin}/auth/callback?next=%2Fapp`
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        })
        return
      }
    }

    // Mensagens escalonadas do loader comunicante (design §3)
    const msgs = [
      'Encaixando sua dor…',
      'Criando o registro na empresa…',
      'Enviando para a moderação…',
    ]
    let msgIdx = 0
    setLoaderMsg(msgs[0])
    const msgTimer = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, msgs.length - 1)
      setLoaderMsg(msgs[msgIdx])
    }, 1200)

    // Resolve sentinel: se a empresa ainda não existe no banco (modo anon / D.6),
    // resolve o id real via obterOuCriarEmpresa antes de submeter a dor (D.8).
    let empresaId = empresa!.id
    if (isSentinel(empresa)) {
      const { obterOuCriarEmpresa } = await import('@/lib/actions/empresa')
      const resolvida = await obterOuCriarEmpresa(empresa!.nome)
      if (!resolvida.ok) {
        // D5: propaga erro mapeado da RPC em vez de mensagem genérica
        clearInterval(msgTimer)
        setLoading(false)
        setErrorMsg(resolvida.error)
        return
      }
      empresaId = resolvida.empresa.id
      setEmpresa(resolvida.empresa)
    }

    // CA27/RN25: persiste rascunho de representante no localStorage
    // para o CacheSkipGate reaproveitar após login OAuth (D.7).
    // Salva ANTES de submeter para que o dado esteja disponível se o usuário
    // for redirecionado para o login e voltar após autenticar.
    try {
      const dorDraft = {
        tipo: 'representante',
        nome: email.split('@')[0] ?? 'Representante',
        empresa: empresaId ? { id: empresaId, nome: empresa!.nome } : { nome: empresa!.nome },
      }
      localStorage.setItem('ubm:dor-draft', JSON.stringify(dorDraft))
    } catch {
      // localStorage indisponível (SSR ou privado) — continua sem cache
    }

    const result = await submeterDorLanding({
      empresaId,
      titulo: titulo.trim() || undefined,
      descricao: descricao.trim(),
      repNome: email.split('@')[0] ?? 'Representante',
      consentimento: consent,
      consentVersion: '1.0',
      consentAt: new Date().toISOString(),
      cursos: cursos.length > 0 ? cursos : undefined,
    })

    clearInterval(msgTimer)
    setLoading(false)

    if (result.ok) {
      setDorId(result.dorId)
      setStep('confirmacao')
    } else {
      setErrorMsg(result.error)
    }
  }

  /* ── Tela de confirmação (CA21) ── */
  if (step === 'confirmacao') {
    return (
      <div className="ubm-confirmacao ubm-machined" aria-live="polite">
        <CheckCircle2 size={40} style={{ color: 'hsl(var(--success))' }} aria-hidden />
        <h1 className="font-display">Recebemos sua dor!</h1>
        <p>
          Ela está <strong>em moderação</strong> — nossa equipe vai analisar em breve.
        </p>
        <p>
          Enviamos um e-mail para você <strong>verificar sua conta</strong>. Verifique
          para acompanhar e destravar o restante.
        </p>
        <p className="ubm-cota ubm-cota--muted" style={{ marginTop: '0.5rem' }}>
          Aprovada → verifique para publicar
        </p>
        {dorId && (
          <a href={`/app/dores/${dorId}`} className="ubm-btn ubm-btn-secondary" style={{ marginTop: '1rem' }}>
            Ver minha dor
          </a>
        )}
      </div>
    )
  }

  /* ── Loader comunicante (modal) ── */
  if (loading) {
    return (
      <div className="ubm-modal-overlay">
        <div className="ubm-modal ubm-machined" role="status" aria-live="polite">
          <div className="ubm-loader">
            <Loader2 className="ubm-spinner" aria-hidden />
            <p className="ubm-loader-msg">{loaderMsg}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ubm-propor">
      <div className="ubm-wizard ubm-machined">
        {/* ── Passo 1: e-mail corporativo ── */}
        {step === 'email' && (
          <div className="ubm-step" role="group" aria-labelledby={`${formId}-email-label`}>
            <label
              id={`${formId}-email-label`}
              htmlFor={`${formId}-email`}
              className="ubm-step-label"
            >
              Qual é o seu e-mail corporativo?
            </label>
            <p className="ubm-step-microcopy">
              Use o e-mail da sua empresa ou organização — não um e-mail pessoal.
            </p>
            <div className="ubm-step-field">
              <input
                id={`${formId}-email`}
                type="email"
                aria-label="E-mail corporativo"
                aria-describedby={emailError ? `${formId}-email-err` : undefined}
                aria-invalid={emailError ? 'true' : undefined}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleEmailContinuar()}
                placeholder="voce@suaempresa.com.br"
                autoComplete="email"
              />
              {emailError && (
                <p id={`${formId}-email-err`} className="ubm-dropzone-error" role="alert">
                  {emailError}
                </p>
              )}
            </div>
            <div className="ubm-wizard-actions">
              <button
                type="button"
                className="ubm-btn ubm-btn-primary"
                onClick={handleEmailContinuar}
                disabled={!email.includes('@')}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ── Passo 2: empresa canônica ── */}
        {step === 'empresa' && (
          <div className="ubm-step" role="group" aria-labelledby={`${formId}-emp-label`}>
            <p id={`${formId}-emp-label`} className="ubm-step-label">De qual empresa você fala?</p>
            <p className="ubm-step-microcopy">
              Selecione a empresa existente ou crie uma nova — assim evitamos nomes duplicados.
            </p>
            <div className="ubm-step-field">
              {/* mode="anon": "Criar empresa" emite sentinel (RN26/CA26) — empresa criada no submit pós-login */}
              <EmpresaCombobox value={empresa} onChange={setEmpresa} mode="anon" />
            </div>
            <div className="ubm-wizard-actions">
              <button type="button" className="ubm-btn ubm-btn-ghost" onClick={() => setStep('email')}>Voltar</button>
              <button
                type="button"
                className="ubm-btn ubm-btn-primary"
                onClick={() => setStep('descricao')}
                disabled={!empresa}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ── Passo 3: descrição da dor ── */}
        {step === 'descricao' && (
          <div className="ubm-step" role="group" aria-labelledby={`${formId}-dor-label`}>
            <label id={`${formId}-dor-label`} htmlFor={`${formId}-dor`} className="ubm-step-label">
              Qual é a dor?
            </label>
            <p className="ubm-step-microcopy">
              Descreva o problema operacional que você gostaria que a UBM ajudasse a resolver.
            </p>
            <div className="ubm-step-field">
              <input
                id={`${formId}-titulo`}
                type="text"
                aria-label="Título do projeto"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título do projeto (opcional) — ex.: Controle de estoque"
                maxLength={160}
                style={{ marginBottom: '0.6rem' }}
              />
              <textarea
                id={`${formId}-dor`}
                aria-label="Descrição da dor"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: temos dificuldade em controlar o estoque de forma eficiente…"
                rows={5}
              />
            </div>
            <div className="ubm-wizard-actions">
              <button type="button" className="ubm-btn ubm-btn-ghost" onClick={() => setStep('empresa')}>Voltar</button>
              <button
                type="button"
                className="ubm-btn ubm-btn-primary"
                onClick={() => setStep('cursos')}
                disabled={descricao.trim().length < 10}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ── Passo 4: cursos (opcional) ── */}
        {step === 'cursos' && (
          <div className="ubm-step" role="group" aria-labelledby={`${formId}-cursos-label`}>
            <p id={`${formId}-cursos-label`} className="ubm-step-label">Algum curso parece encaixar? <span style={{ fontWeight: 400, fontSize: '0.85em' }}>(opcional)</span></p>
            <p className="ubm-step-microcopy">Escolha um ou mais cursos, ou &ldquo;Não sei&rdquo;.</p>
            <div className="ubm-step-field">
              <CourseMultiSelect value={cursos} onChange={setCursos} />
            </div>
            <div className="ubm-wizard-actions">
              <button type="button" className="ubm-btn ubm-btn-ghost" onClick={() => setStep('descricao')}>Voltar</button>
              <button type="button" className="ubm-btn ubm-btn-primary" onClick={() => setStep('consent')}>
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ── Passo 5: consentimento + envio ── */}
        {(step === 'consent' || step === 'submit') && (
          <div className="ubm-step" role="group" aria-labelledby={`${formId}-consent-label`}>
            <p id={`${formId}-consent-label`} className="ubm-step-label">Podemos seguir?</p>
            <p className="ubm-step-microcopy">Precisamos do seu consentimento para tratar os dados informados.</p>
            <div className="ubm-step-field">
              <ConsentGate checked={consent} onChange={setConsent} />
            </div>
            {!empresa && (
              <p className="ubm-cota ubm-cota--muted" style={{ fontSize: '0.8rem' }}>
                Selecione ou crie sua empresa para continuar.
              </p>
            )}
            {errorMsg && (
              <p className="ubm-dropzone-error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={16} aria-hidden />
                {errorMsg}
              </p>
            )}
            <div className="ubm-wizard-actions">
              <button type="button" className="ubm-btn ubm-btn-ghost" onClick={() => setStep('cursos')}>Voltar</button>
              <button
                type="button"
                className="ubm-btn ubm-btn-primary"
                onClick={handleSubmit}
                disabled={!podeEnviar}
              >
                Enviar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
