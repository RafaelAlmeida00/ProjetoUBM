'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { assumirPapel, type Papel } from '@/lib/actions/assumir-papel'
import { onboardingRepresentante, onboardingAluno } from '@/lib/actions/onboarding'
import { EmpresaCombobox } from '@/components/empresa/EmpresaCombobox'
import { CourseMultiSelect } from '@/components/course/CourseMultiSelect'
import { Node } from '@/components/brand/Node'
import { CacheSkipGate } from '@/components/onboarding/CacheSkipGate'
import type { EmpresaResult } from '@/lib/actions/empresa'
import type { CursoUbm } from '@/lib/courses'
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

  // Infos por tipo — representante
  const [empresa, setEmpresa] = useState<EmpresaResult | null>(null)
  const [departamento, setDepartamento] = useState('')
  const [cargo, setCargo] = useState('')
  const [emailCorporativo, setEmailCorporativo] = useState('')
  const [emailCorporativoErro, setEmailCorporativoErro] = useState<string | null>(null)

  // Infos por tipo — aluno
  const [cursos, setCursos] = useState<CursoUbm[]>([])

  const handleAvancar = () => {
    if (!selected) return
    setEtapa('infos')
  }

  const podeAvancar = !!selected

  // Representante: empresa + e-mail corporativo válido (não-gratuito, com @) obrigatórios
  const podeConcluirRepresentante = !!empresa && isEmailCorporativo(emailCorporativo)

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
          nome: '',
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
        const result = await onboardingAluno({ nome: '', cursoIds: cursos as string[] })
        if (!result.ok) {
          setError((result as { ok: false; error: string }).error)
          setLoading(false)
          return
        }
      } else if (selected === 'coordenador') {
        // Coordenador: apenas assume o papel (curso atribuído pelo admin — CA29/RN24)
        const result = await assumirPapel('coordenador')
        if (!result.ok) {
          setError('Não conseguimos definir seu papel. Tente novamente.')
          setLoading(false)
          return
        }
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
              Sobre sua empresa
            </h1>
            <p
              style={{
                color: 'hsl(var(--muted-foreground))',
                marginBottom: '1.5rem',
                fontSize: '0.95rem',
              }}
            >
              Informe a empresa que você representa e seu papel nela.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
              Seus cursos
            </h1>
            <p
              style={{
                color: 'hsl(var(--muted-foreground))',
                marginBottom: '1.5rem',
                fontSize: '0.95rem',
              }}
            >
              Quais cursos da UBM você cursa? Pode selecionar mais de um.
            </p>

            <CourseMultiSelect value={cursos} onChange={setCursos} />
          </>
        )}

        {/* ── Coordenador — estado passivo (CA29/RN24) ─────── */}
        {selected === 'coordenador' && (
          <>
            <h1
              className="font-display"
              style={{
                fontSize: 'clamp(1.4rem, 4vw, 2rem)',
                fontWeight: 600,
                marginBottom: '0.5rem',
              }}
            >
              Aguardando atribuição
            </h1>
            <p
              style={{
                color: 'hsl(var(--muted-foreground))',
                marginBottom: '1.5rem',
                fontSize: '0.95rem',
              }}
            >
              O curso que você coordena será atribuído pelo administrador da UBM.
              Isso garante que a coordenação seja validada antes de liberar o acesso.
            </p>
            <div
              className="ubm-machined"
              style={{
                padding: '1rem 1.25rem',
                borderColor: 'hsl(var(--warning) / 0.5)',
                background: 'hsl(var(--warning) / 0.07)',
                fontSize: '0.9rem',
                color: 'hsl(var(--muted-foreground))',
              }}
              role="status"
              aria-live="polite"
            >
              <span style={{ fontWeight: 600, color: 'hsl(var(--warning))' }}>
                Aguardando atribuição de curso
              </span>
              <br />
              Quando um administrador atribuir o curso a você, o acesso de coordenador
              ficará disponível automaticamente.
            </div>
          </>
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
              (selected === 'representante' && !podeConcluirRepresentante)
            }
            onClick={handleConcluir}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Finalizando…
              </>
            ) : (
              'Concluir'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * T3 — /app/onboarding: onboarding coeso (tipo + infos por tipo).
 * RN21-24 / CA24/CA25/CA29.
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
