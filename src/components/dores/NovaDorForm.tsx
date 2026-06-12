'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock, AlertCircle } from 'lucide-react'
import { criarDor } from '@/lib/actions/dor'
import { CourseMultiSelect } from '@/components/course/CourseMultiSelect'
import { ConsentGate } from '@/components/consent/ConsentGate'
import type { CursoUbm } from '@/lib/courses'

const CONSENT_VERSION = '1.0'

interface Empresa {
  id: string
  nome: string
}

interface NovaDorFormProps {
  empresas: Empresa[]
}

/**
 * Delta 3 — NovaDorForm: formulário ENXUTO para representante logado criar dor.
 * NÃO pede e-mail, nome, cargo (já vem da sessão).
 * Empresa pré-selecionada (se uma só) ou seletor (se múltiplas).
 * Chama criarDor → redireciona para /app/dores/{dorId}.
 */
export function NovaDorForm({ empresas }: NovaDorFormProps) {
  const router = useRouter()

  const [empresaId, setEmpresaId] = useState<string>(empresas[0]?.id ?? '')
  const [descricao, setDescricao] = useState('')
  const [cursos, setCursos] = useState<CursoUbm[]>([])
  const [consentimento, setConsentimento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  /* ── Bloqueado: usuário não é representante de nenhuma empresa ── */
  if (empresas.length === 0) {
    return (
      <div className="ubm-locked" aria-label="Acesso bloqueado">
        <Lock className="ubm-locked-icon" aria-hidden />
        <span className="ubm-cota">RESTRITO</span>
        <p className="ubm-locked-title">Você não é representante de nenhuma empresa.</p>
        <p className="ubm-locked-msg">
          Conclua seu{' '}
          <Link href="/app/onboarding" className="ubm-link">
            cadastro de representante
          </Link>{' '}
          para criar dores.
        </p>
      </div>
    )
  }

  const descricaoValida = descricao.trim().length >= 10
  const podeCriar = descricaoValida && consentimento && !enviando && !!empresaId

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!podeCriar) return
    setEnviando(true)
    setErro('')
    const result = await criarDor({
      empresaId,
      descricao: descricao.trim(),
      cursos: cursos.length > 0 ? cursos : undefined,
      consentimento: true,
      consentVersion: CONSENT_VERSION,
      consentAt: new Date().toISOString(),
    })
    setEnviando(false)
    if (result.ok) {
      router.push(`/app/dores/${result.dorId}`)
    } else {
      setErro(result.error)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="ubm-machined"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '48rem' }}
      aria-label="Formulário de nova dor"
    >
      {/* ── Empresa ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {empresas.length === 1 ? (
          <div>
            <p className="ubm-cota" style={{ marginBottom: '0.25rem' }}>Empresa</p>
            <p style={{ fontWeight: 600 }}>{empresas[0].nome}</p>
          </div>
        ) : (
          <label htmlFor="empresa-select" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span className="ubm-cota">Empresa</span>
            <select
              id="empresa-select"
              aria-label="Empresa"
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              className="ubm-input"
              required
            >
              <option value="" disabled>Selecione sua empresa…</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* ── Descrição ── */}
      <label htmlFor="descricao" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span className="ubm-cota">
          Descrição <span aria-hidden style={{ color: 'hsl(var(--destructive))' }}>*</span>
        </span>
        <textarea
          id="descricao"
          aria-label="Descrição"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descreva a dor da sua empresa com detalhes (mín. 10 caracteres)…"
          rows={5}
          className="ubm-input"
          minLength={10}
          required
          style={{ resize: 'vertical' }}
        />
        <span className="ubm-cota ubm-cota--muted" style={{ fontSize: '0.82rem' }}>
          Mínimo 10 caracteres.
        </span>
      </label>

      {/* ── Cursos (opcional) ── */}
      <CourseMultiSelect value={cursos} onChange={setCursos} />

      {/* ── Consentimento LGPD ── */}
      <ConsentGate checked={consentimento} onChange={setConsentimento} />

      {/* ── Erro ── */}
      {erro && (
        <p className="ubm-dropzone-error" role="alert" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <AlertCircle size={14} aria-hidden />
          {erro}
        </p>
      )}

      {/* ── Botão ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          className="ubm-btn ubm-btn-primary"
          disabled={!podeCriar}
          style={{ minWidth: '10rem' }}
        >
          {enviando ? 'Criando…' : 'Criar rascunho'}
        </button>
      </div>
    </form>
  )
}
