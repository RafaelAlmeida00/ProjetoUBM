'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock, AlertCircle } from 'lucide-react'
import { criarDor, submeterDor } from '@/lib/actions/dor'
import { CourseMultiSelect } from '@/components/course/CourseMultiSelect'
import { ConsentGate } from '@/components/consent/ConsentGate'
import { useToast } from '@/components/feedback/ToastProvider'
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
  const toast = useToast()

  const [empresaId, setEmpresaId] = useState<string>(empresas[0]?.id ?? '')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [cursos, setCursos] = useState<CursoUbm[]>([])
  const [consentimento, setConsentimento] = useState(false)
  // qual ação está em voo: 'enviar' (→ moderação) | 'rascunho' (só salva) | null (ocioso)
  const [acao, setAcao] = useState<'enviar' | 'rascunho' | null>(null)
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

  const tituloValido = titulo.trim().length >= 3
  const descricaoValida = descricao.trim().length >= 10
  const ocupado = acao !== null
  const podeCriar = tituloValido && descricaoValida && consentimento && !ocupado && !!empresaId

  // Cria a dor e, no modo 'enviar', já a submete à moderação (criar = enviar ao admin).
  // No modo 'rascunho', apenas salva — o autor envia depois pela tela da dor.
  async function criar(modo: 'enviar' | 'rascunho') {
    if (!podeCriar) return
    setAcao(modo)
    setErro('')
    const result = await criarDor({
      empresaId,
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      cursos: cursos.length > 0 ? cursos : undefined,
      consentimento: true,
      consentVersion: CONSENT_VERSION,
      consentAt: new Date().toISOString(),
    })
    if (!result.ok) {
      setAcao(null)
      setErro(result.error)
      toast.erro(result.error || 'Não foi possível enviar sua dor. Tente novamente.')
      return
    }
    // Enviar = submete à moderação. Se o submit falhar, a dor já existe como rascunho
    // e pode ser reenviada na própria tela da dor — não recriamos (evita duplicar).
    if (modo === 'enviar') {
      const submitResult = await submeterDor(result.dorId)
      if (submitResult.ok) {
        toast.sucesso('Dor enviada para análise.')
      } else {
        toast.erro(submitResult.error || 'Não foi possível enviar sua dor. Tente novamente.')
      }
    } else {
      toast.sucesso('Rascunho salvo.')
    }
    router.push(`/app/dores/${result.dorId}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await criar('enviar')
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

      {/* ── Título do projeto ── */}
      <label htmlFor="titulo" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span className="ubm-cota">
          Título do projeto <span aria-hidden style={{ color: 'hsl(var(--destructive))' }}>*</span>
        </span>
        <input
          id="titulo"
          type="text"
          aria-label="Título do projeto"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex.: Automação da linha de montagem"
          className="ubm-input"
          minLength={3}
          maxLength={160}
          required
        />
        <span className="ubm-cota ubm-cota--muted" style={{ fontSize: '0.82rem' }}>
          Identidade do projeto na plataforma (aparece como “Título — Empresa”).
        </span>
      </label>

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

      {/* ── Ações: enviar (primário, à frente) + salvar rascunho (secundário) ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="submit"
          className="ubm-btn ubm-btn-primary"
          disabled={!podeCriar}
          style={{ minWidth: '10rem' }}
        >
          {acao === 'enviar' ? 'Enviando…' : 'Enviar dor'}
        </button>
        <button
          type="button"
          className="ubm-btn ubm-btn-secondary"
          onClick={() => criar('rascunho')}
          disabled={!podeCriar}
          style={{ minWidth: '10rem' }}
        >
          {acao === 'rascunho' ? 'Salvando…' : 'Salvar como rascunho'}
        </button>
      </div>
    </form>
  )
}
