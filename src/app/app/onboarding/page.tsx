'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import { assumirPapel, type Papel } from '@/lib/actions/assumir-papel'
import { onboardingRepresentante, onboardingAluno, onboardingCoordenador } from '@/lib/actions/onboarding'
import { atualizarPerfil } from '@/lib/actions/perfil'
import { CourseSingleSelect } from '@/components/course/CourseSingleSelect'
import { CURSOS_UBM, type CursoUbm } from '@/lib/courses'
import { EmpresaCombobox } from '@/components/empresa/EmpresaCombobox'
import { CourseMultiSelect } from '@/components/course/CourseMultiSelect'
import { Node } from '@/components/brand/Node'
import { CacheSkipGate } from '@/components/onboarding/CacheSkipGate'
import type { EmpresaResult } from '@/lib/actions/empresa'
import { validarEmailCorporativo, isEmailCorporativo } from '@/lib/validation/email-corporativo'

const PAPEIS: { id: Papel; label: string; desc: string }[] = [
  {
    id: 'aluno',
    label: 'Aluno',
    desc: 'Quero participar de projetos de extensão.',
  },
  {
    id: 'coordenador',
    label: 'Coordenador',
    desc: 'Coordeno um curso e avalio dores.',
  },
  {
    id: 'representante',
    label: 'Representante',
    desc: 'Represento uma empresa e tenho dores a propor.',
  },
]

type Etapa = 'tipo' | 'infos'

/**
 * Campo Nome compartilhado entre os 3 fluxos de infos.
 * Usa as primitivas .ubm-field/.ubm-field-label/.ubm-field-help/.ubm-field-error (ux-ui 2026-06-12).
 */
function NomeField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const nomeErro = value.length > 0 && value.trim().length < 2
  return (
    <div className="ubm-field">
      <label htmlFor="onb-nome" className="ubm-field-label">
        Nome <span className="ubm-req">*</span>
      </label>
      <input
        id="onb-nome"
        type="text"
        aria-required="true"
        aria-describedby="onb-nome-help onb-nome-err"
        aria-invalid={nomeErro ? 'true' : undefined}
        className="ubm-combobox-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Como você quer ser chamado(a)"
        autoComplete="name"
      />
      <p id="onb-nome-help" className="ubm-field-help">
        É assim que você aparece para colegas e coordenadores na plataforma.
      </p>
      {nomeErro && (
        <p id="onb-nome-err" role="alert" className="ubm-field-error">
          <AlertCircle aria-hidden />
          Informe seu nome para continuar.
        </p>
      )}
    </div>
  )
}

/**
 * Componente interno que usa useSearchParams — deve ficar dentro de Suspense.
 */
function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next') ?? '/app'

  const [etapa, setEtapa] = useState<Etapa>('tipo')
  const [selected, setSelected] = useState<Papel | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Nome — obrigatório para todos os papéis
  const [nome, setNome] = useState('')
  const nomeValido = nome.trim().length >= 2

  // Infos por tipo — representante
  const [empresa, setEmpresa] = useState<EmpresaResult | null>(null)
  const [departamento, setDepartamento] = useState('')
  const [cargo, setCargo] = useState('')
  const [emailCorporativo, setEmailCorporativo] = useState('')
  const [emailCorporativoErro, setEmailCorporativoErro] = useState<string | null>(null)

  // Infos por tipo — aluno
  const [cursos, setCursos] = useState<CursoUbm[]>([])

  // Infos por tipo — coordenador
  const [cursoCoord, setCursoCoord] = useState<CursoUbm | null>(null)
  const [cursoCoordErro, setCursoCoordErro] = useState<string | null>(null)
  // estado da máquina de estados do ramo coordenador
  const [coordEstado, setCoordEstado] = useState<'editando' | 'enviando' | 'enviado' | 'erro'>('editando')

  const handleAvancar = () => {
    if (!selected) return
    setEtapa('infos')
  }

  const podeAvancar = !!selected

  // Representante: empresa + e-mail corporativo válido + nome
  const podeConcluirRepresentante = !!empresa && isEmailCorporativo(emailCorporativo) && nomeValido

  // Aluno: nome obrigatório (cursos opcionais)
  const podeConcluirAluno = nomeValido

  // Coordenador: nome obrigatório + curso selecionado
  const podeConcluirCoordenador = nomeValido && !!cursoCoord

  const handleConcluir = async () => {
    if (!selected) return
    setLoading(true)
    setError(null)

    try {
      if (selected === 'representante') {
        if (!empresa) {
          setError('Selecione ou crie sua empresa para continuar.')
          setLoading(false)
          return
        }
        const result = await onboardingRepresentante({
          empresaId: empresa.id,
          nome: nome.trim(),
          departamento: departamento || null,
          cargo: cargo || null,
          emailCorporativo,
        })
        if (!result.ok) {
          setError((result as { ok: false; error: string }).error)
          setLoading(false)
          return
        }
      } else if (selected === 'aluno') {
        const result = await onboardingAluno({ nome: nome.trim(), cursoIds: cursos as string[] })
        if (!result.ok) {
          setError((result as { ok: false; error: string }).error)
          setLoading(false)
          return
        }
      } else if (selected === 'coordenador') {
        if (!cursoCoord) {
          setCursoCoordErro('Selecione o curso que você coordena.')
          setLoading(false)
          return
        }
        setCoordEstado('enviando')
        const result = await onboardingCoordenador({ cursoId: cursoCoord, nome: nome.trim() })
        if (!result.ok) {
          setCoordEstado('erro')
          setError((result as { ok: false; error: string }).error ?? 'Não foi possível enviar seu cadastro. Tente novamente.')
          setLoading(false)
          return
        }
        setCoordEstado('enviado')
        setLoading(false)
        return
      }
    } catch {
      setError('Erro inesperado. Tente novamente.')
      setLoading(false)
      return
    }

    setLoading(false)
    router.push(nextUrl)
  }

  // ── Etapa 1: Escolha de tipo ─────────────────────────────────────────────
  if (etapa === 'tipo') {
    return (
      <div className="ubm-propor" style={{ alignItems: 'center' }}>
        <div
          className="ubm-machined"
          style={{ width: 'min(42rem, 94vw)', padding: 'clamp(1.75rem, 5vw, 2.75rem)' }}
        >
          <div style={{ marginBottom: '0.5rem' }}>
            <span className="ubm-cota">ONBOARDING</span>
          </div>
          <h1
            className="font-display"
            style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 600, marginBottom: '0.5rem' }}
          >
            Como você chega à UBM?
          </h1>
          <p
            style={{
              color: 'hsl(var(--muted-foreground))',
              marginBottom: '1.75rem',
              fontSize: '0.98rem',
            }}
          >
            Escolha o papel que melhor descreve sua relação com a UBM.
          </p>

          {/* RADIOGROUP — WAI-ARIA */}
          <div
            role="radiogroup"
            aria-label="Escolha seu papel"
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
            }}
          >
            {PAPEIS.map((p) => (
              <label
                key={p.id}
                className="ubm-machined"
                style={{
                  padding: '1.25rem',
                  cursor: 'pointer',
                  borderColor: selected === p.id ? 'hsl(var(--primary))' : undefined,
                  background: selected === p.id ? 'hsl(var(--primary) / 0.08)' : undefined,
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  role="radio"
                  name="papel"
                  value={p.id}
                  checked={selected === p.id}
                  aria-checked={selected === p.id}
                  aria-describedby={`desc-${p.id}`}
                  onChange={() => setSelected(p.id)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div
                    className="ubm-overlap ubm-clip-node"
                    style={{ width: '2.25rem', height: '2.25rem', marginBottom: '0.25rem' }}
                  >
                    <Node className="ubm-node" />
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 600,
                      fontSize: '1.1rem',
                    }}
                  >
                    {p.label}
                  </span>
                  <span
                    id={`desc-${p.id}`}
                    style={{
                      color: 'hsl(var(--muted-foreground))',
                      fontSize: '0.9rem',
                      lineHeight: 1.45,
                    }}
                  >
                    {p.desc}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {error && (
            <p
              role="alert"
              style={{
                color: 'hsl(var(--destructive))',
                marginTop: '1rem',
                fontSize: '0.9rem',
              }}
            >
              {error}
            </p>
          )}

          <div
            style={{ marginTop: '1.75rem', display: 'flex', justifyContent: 'flex-end' }}
          >
            <button
              type="button"
              className="ubm-btn ubm-btn-primary"
              disabled={!podeAvancar || loading}
              onClick={handleAvancar}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Preparando seu espaço…
                </>
              ) : (
                'Continuar'
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Etapa 2: Infos por tipo ───────────────────────────────────────────────
  return (
    <div className="ubm-propor" style={{ alignItems: 'center' }}>
      <div
        className="ubm-machined"
        style={{ width: 'min(42rem, 94vw)', padding: 'clamp(1.75rem, 5vw, 2.75rem)' }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <span className="ubm-cota">ONBOARDING</span>
        </div>

        {/* ── Representante ─────────────────────────────────── */}
        {selected === 'representante' && (
          <>
            <h1
              className="font-display"
              style={{
                fontSize: 'clamp(1.4rem, 4vw, 2rem)',
                fontWeight: 600,
                marginBottom: '0.5rem',
              }}
            >
              Sobre você e sua empresa
            </h1>
            <p
              style={{
                color: 'hsl(var(--muted-foreground))',
                marginBottom: '1.5rem',
                fontSize: '0.95rem',
              }}
            >
              Informe seu nome, a empresa que você representa e seu papel nela.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <NomeField value={nome} onChange={setNome} />

              <EmpresaCombobox
                value={empresa}
                onChange={setEmpresa}
                mode="auth"
                label="Empresa *"
                placeholder="Busque ou crie sua empresa…"
              />

              <div>
                <label
                  htmlFor="onb-email-corp"
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    marginBottom: '0.35rem',
                    fontSize: '0.9rem',
                  }}
                >
                  E-mail corporativo de contato *
                </label>
                <input
                  id="onb-email-corp"
                  type="email"
                  aria-label="E-mail corporativo de contato"
                  aria-describedby="onb-email-corp-helper onb-email-corp-erro"
                  aria-invalid={emailCorporativoErro ? 'true' : undefined}
                  className="ubm-combobox-input"
                  value={emailCorporativo}
                  onChange={(e) => {
                    setEmailCorporativo(e.target.value)
                    // Limpa erro ao digitar para não travar a experiência
                    if (emailCorporativoErro) setEmailCorporativoErro(null)
                  }}
                  onBlur={(e) => setEmailCorporativoErro(validarEmailCorporativo(e.target.value))}
                  placeholder="voce@suaempresa.com.br"
                />
                <p
                  id="onb-email-corp-helper"
                  style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.2rem' }}
                >
                  É por aqui que a UBM fala com a sua empresa: avisamos quando uma dor é aprovada,
                  publicada ou recebe interesse de alunos. Use o e-mail da empresa — não é o seu login.
                </p>
                {emailCorporativoErro && (
                  <p
                    id="onb-email-corp-erro"
                    role="alert"
                    style={{
                      fontSize: '0.8rem',
                      color: 'hsl(var(--destructive))',
                      marginTop: '0.25rem',
                    }}
                  >
                    {emailCorporativoErro}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="onb-departamento"
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    marginBottom: '0.35rem',
                    fontSize: '0.9rem',
                  }}
                >
                  Departamento
                </label>
                <input
                  id="onb-departamento"
                  type="text"
                  aria-label="Departamento"
                  className="ubm-combobox-input"
                  value={departamento}
                  onChange={(e) => setDepartamento(e.target.value)}
                  placeholder="Ex.: Tecnologia, Financeiro…"
                />
              </div>

              <div>
                <label
                  htmlFor="onb-cargo"
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    marginBottom: '0.35rem',
                    fontSize: '0.9rem',
                  }}
                >
                  Cargo
                </label>
                <input
                  id="onb-cargo"
                  type="text"
                  aria-label="Cargo"
                  className="ubm-combobox-input"
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  placeholder="Ex.: Gerente de TI, Analista…"
                />
              </div>
            </div>
          </>
        )}

        {/* ── Aluno ─────────────────────────────────────────── */}
        {selected === 'aluno' && (
          <>
            <h1
              className="font-display"
              style={{
                fontSize: 'clamp(1.4rem, 4vw, 2rem)',
                fontWeight: 600,
                marginBottom: '0.5rem',
              }}
            >
              Seus dados
            </h1>
            <p
              style={{
                color: 'hsl(var(--muted-foreground))',
                marginBottom: '1.5rem',
                fontSize: '0.95rem',
              }}
            >
              Informe seu nome e os cursos da UBM que você cursa.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <NomeField value={nome} onChange={setNome} />
              <CourseMultiSelect value={cursos} onChange={setCursos} />
            </div>
          </>
        )}

        {/* ── Coordenador — estado ativo (Onda 2 / CA29/RN24) ── */}
        {selected === 'coordenador' && coordEstado !== 'enviado' && (
          <>
            <h1
              className="font-display"
              style={{
                fontSize: 'clamp(1.4rem, 4vw, 2rem)',
                fontWeight: 600,
                marginBottom: '0.5rem',
              }}
            >
              Qual curso você coordena?
            </h1>
            <p
              style={{
                color: 'hsl(var(--muted-foreground))',
                marginBottom: '1.5rem',
                fontSize: '0.95rem',
              }}
            >
              Informe seu nome e o curso que você coordena na UBM. Seu acesso de coordenador
              é liberado após a aprovação de um administrador.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <NomeField value={nome} onChange={setNome} />
              <CourseSingleSelect
                value={cursoCoord}
                onChange={(v) => { setCursoCoord(v); setCursoCoordErro(null) }}
                error={cursoCoordErro}
              />
            </div>
          </>
        )}

        {/* ── Coordenador — painel pós-envio (EM ANÁLISE) ─────── */}
        {selected === 'coordenador' && coordEstado === 'enviado' && (
          <div
            className="ubm-machined"
            style={{
              borderColor: 'hsl(var(--warning) / 0.5)',
              background: 'hsl(var(--warning) / 0.07)',
              padding: '1.25rem 1.5rem',
            }}
            role="status"
            aria-live="polite"
          >
            <span className="ubm-cota" style={{ color: 'hsl(var(--warning))' }}>
              EM ANÁLISE
            </span>
            <p className="ubm-confirm-title">Cadastro enviado — aguardando aprovação</p>
            <p className="ubm-confirm-msg" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Recebemos seu cadastro de coordenador de{' '}
              <strong>
                {CURSOS_UBM.find((c) => c.value === cursoCoord)?.label ?? cursoCoord}
              </strong>
              . Um administrador da UBM vai revisar e aprovar seu acesso. Você pode usar
              a plataforma normalmente enquanto isso.
            </p>
            <div className="ubm-confirm-actions">
              <a href="/app" className="ubm-btn ubm-btn-primary">
                Ir para a plataforma
              </a>
            </div>
          </div>
        )}

        {error && (
          <p
            role="alert"
            style={{
              color: 'hsl(var(--destructive))',
              marginTop: '1rem',
              fontSize: '0.9rem',
            }}
          >
            {error}
          </p>
        )}

        {/* Barra de ações — oculta no painel pós-envio do coordenador */}
        {!(selected === 'coordenador' && coordEstado === 'enviado') && (
          <div
            style={{
              marginTop: '1.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              className="ubm-btn ubm-btn-ghost"
              onClick={() => setEtapa('tipo')}
            >
              Voltar
            </button>
            <button
              type="button"
              className="ubm-btn ubm-btn-primary"
              disabled={
                loading ||
                (selected === 'representante' && !podeConcluirRepresentante) ||
                (selected === 'aluno' && !podeConcluirAluno) ||
                (selected === 'coordenador' && !podeConcluirCoordenador)
              }
              onClick={handleConcluir}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  {selected === 'coordenador' ? 'Enviando cadastro…' : 'Finalizando…'}
                </>
              ) : (
                'Concluir'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * T3 — /app/onboarding: onboarding coeso (tipo + infos por tipo).
 * RN21-24 / CA24/CA25/CA29.
 * Fix identidade: captura Nome obrigatório (≥2 chars) para todos os papéis.
 * Suspense necessário para useSearchParams() no build estático do Next.
 */
export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div
          className="ubm-propor"
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <Loader2 className="animate-spin" aria-hidden />
        </div>
      }
    >
      {/*
       * CacheSkipGate (CA27/CA28/RN25): se houver draft válido em localStorage
       * (tipo=representante + empresa), popula a identidade automaticamente e
       * salta o onboarding manual. Caso contrário (fallback) → OnboardingContent.
       * semIdentidade=true porque esta página só é atingida via IdentidadeGate
       * quando o usuário ainda não tem papel.
       */}
      <CacheSkipGate semIdentidade>
        <OnboardingContent />
      </CacheSkipGate>
    </Suspense>
  )
}
