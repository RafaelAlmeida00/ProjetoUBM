'use client'
import { useState, useRef, useId } from 'react'
import { Paperclip, X, TriangleAlert, Upload } from 'lucide-react'
import { removerAnexo, uploadAnexo } from '@/lib/actions/anexo'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export interface AnexoMeta {
  id: string
  nome_original: string
  mime_type: string
  tamanho_bytes: number
}

interface AnexoUploaderProps {
  dorId: string
  anexos: AnexoMeta[]
  /** Desabilitado (dor em_moderacao/publicada sem edição) */
  readOnly?: boolean
  onChange?: (anexos: AnexoMeta[]) => void
}

/* ── Allowlist de MIME types (security.md §3 / RS-A2) ── */
const MIME_PERMITIDOS = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const TAMANHO_MAX = 5 * 1024 * 1024 // 5 MB
const MAX_ARQUIVOS = 5

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extLabel(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'PNG',
    'image/jpeg': 'JPG',
    'image/webp': 'WEBP',
    'application/pdf': 'PDF',
    'text/csv': 'CSV',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  }
  return map[mime] ?? mime
}

/**
 * T-O3.5 — AnexoUploader (.ubm-dropzone / .ubm-attach-item).
 * Valida tipo/tamanho/quantidade na borda (CA15).
 * Upload binário ao Storage via client Supabase (método `uploadArquivoStorage` injetável).
 * Aviso PII obrigatório (RN15). Nome exibido como TEXTO (anti-XSS).
 */
export function AnexoUploader({
  dorId,
  anexos: anexosIniciais,
  readOnly = false,
  onChange,
}: AnexoUploaderProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const [anexos, setAnexos] = useState<AnexoMeta[]>(anexosIniciais)
  const [erro, setErro] = useState('')
  const [dragover, setDragover] = useState(false)
  const [uploading, setUploading] = useState(false)

  function emitChange(novos: AnexoMeta[]) {
    setAnexos(novos)
    onChange?.(novos)
  }

  function validar(arquivo: File): string | null {
    if (anexos.length >= MAX_ARQUIVOS) return `Limite de 5 arquivos atingido.`
    if (!MIME_PERMITIDOS.includes(arquivo.type)) return `Tipo não permitido. Use: PNG, JPG, WEBP, PDF, CSV ou XLSX.`
    if (arquivo.size > TAMANHO_MAX) return `Arquivo muito grande — máx. 5 MB.`
    return null
  }

  async function processarArquivo(arquivo: File) {
    const erroValidacao = validar(arquivo)
    if (erroValidacao) {
      setErro(erroValidacao)
      return
    }
    setErro('')
    setUploading(true)

    try {
      // Upload ao Storage do Supabase (browser client — nunca service_role no cliente)
      const supabase = createSupabaseBrowserClient()
      const path = `dor/${dorId}/${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const { error: storageErr } = await supabase.storage
        .from('dor-anexos')
        .upload(path, arquivo, { upsert: false })

      if (storageErr) {
        setErro('Não foi possível enviar o arquivo. Tente novamente.')
        return
      }

      // Registra metadados via Server Action
      const result = await uploadAnexo(dorId, path, {
        nome_original: arquivo.name,
        mime_type: arquivo.type,
        tamanho_bytes: arquivo.size,
      })

      if (!result.ok) {
        setErro(result.error)
        return
      }

      emitChange([...anexos, result.anexo])
    } catch {
      setErro('Erro inesperado ao enviar o arquivo.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemover(anexoId: string) {
    const result = await removerAnexo(anexoId)
    if (result.ok) {
      emitChange(anexos.filter((a) => a.id !== anexoId))
    } else {
      setErro(result.error)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (arquivo) processarArquivo(arquivo)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragover(false)
    const arquivo = e.dataTransfer.files?.[0]
    if (arquivo) processarArquivo(arquivo)
  }

  return (
    <section aria-label="Anexos" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* ── Dropzone ── */}
      {!readOnly && (
        <div
          className={`ubm-dropzone${dragover ? ' is-dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
          role="button"
          tabIndex={0}
          aria-label="Área de upload de anexos — clique ou arraste o arquivo"
          aria-disabled={uploading || anexos.length >= MAX_ARQUIVOS}
          style={{ cursor: uploading || anexos.length >= MAX_ARQUIVOS ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}
        >
          <Upload className="ubm-dropzone-icon" aria-hidden />
          <p className="ubm-dropzone-cta">
            <b>Clique</b> ou arraste para adicionar
          </p>
          <p className="ubm-dropzone-limits">
            Até 5 arquivos, 5 MB cada. PNG, JPG, WEBP, PDF, CSV ou XLSX.
          </p>
          <input
            ref={inputRef}
            id={`${id}-file`}
            type="file"
            aria-label="Selecionar arquivo"
            onChange={handleInputChange}
          />
        </div>
      )}

      {/* ── Aviso PII obrigatório (RN15 / RS-A6) ── */}
      <div className="ubm-dropzone-pii">
        <TriangleAlert aria-hidden />
        <span>
          Não inclua <strong>dados pessoais ou sensíveis</strong> nos arquivos — eles ficam
          públicos quando a dor é publicada.
        </span>
      </div>

      {/* ── Erro de recusa ── */}
      {erro && (
        <p className="ubm-dropzone-error" role="alert">
          {erro}
        </p>
      )}

      {/* ── Lista de anexos ── */}
      {anexos.length > 0 && (
        <ul className="ubm-attach-list" aria-label="Arquivos anexados">
          {anexos.map((a) => (
            <li key={a.id} className="ubm-attach-item">
              <Paperclip className="ubm-attach-item-icon" aria-hidden />
              <div className="ubm-attach-item-body">
                {/* Nome como texto puro (anti-XSS — nunca dangerouslySetInnerHTML) */}
                <span className="ubm-attach-item-name">{a.nome_original}</span>
                <span className="ubm-attach-item-meta">
                  {extLabel(a.mime_type)} · {formatBytes(a.tamanho_bytes)}
                </span>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  className="ubm-attach-item-remove"
                  aria-label={`Remover ${a.nome_original}`}
                  onClick={() => handleRemover(a.id)}
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
