'use client'
/**
 * T19 — PaletaEditor (Zona B)
 *
 * Editor de paleta de empresa: empresa (combobox) + cor-semente → tríade ao vivo
 * + gate AA (badge + report) + CTA Salvar (desabilitado enquanto reprovada).
 * CA4/CA5/CA6/CA7 / design §5.2.
 */
import { useState, useCallback, useId } from 'react'
import { CheckCircle, AlertTriangle, Save } from 'lucide-react'
import { gerarTriade, validarAA } from '@/lib/theming/paleta-core'
import { salvarPaleta } from '@/lib/actions/admin-paletas'
import type { TriadeResult } from '@/lib/theming/paleta-core'
import { useToast } from '@/components/feedback/ToastProvider'

export interface Empresa {
  id: string
  nomeCanonico: string
}

interface PaletaEditorProps {
  empresas: Empresa[]
  onSalva?: (triade: TriadeResult) => void
  onPreview?: (triade: TriadeResult | null) => void
}

export function PaletaEditor({ empresas, onSalva, onPreview }: PaletaEditorProps) {
  const toast = useToast()

  const seedId = useId()
  const colorId = useId()
  const marsalaId = useId()
  const empresaId = useId()
  const aaLiveId = useId()

  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('')
  const [sementeHsl, setSementeHsl] = useState<string>('205 68% 33%')
  const [manterMarsala, setManterMarsala] = useState(true)
  const [triade, setTriade] = useState<TriadeResult | null>(null)
  const [aaOk, setAaOk] = useState<boolean | null>(null)
  const [aaFalhas, setAaFalhas] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Converte "H S% L%" para valor hex aproximado para o color picker nativo
  function hslToHex(hsl: string): string {
    const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(hsl.trim())
    if (!m) return '#1c5e91'
    const h = parseFloat(m[1]) / 360
    const s = parseFloat(m[2]) / 100
    const l = parseFloat(m[3]) / 100
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => {
      const k = (n + h * 12) % 12
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
      return Math.round(255 * c).toString(16).padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`
  }

  // Converte hex do color picker para "H S% L%"
  function hexToHslStr(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
    let h = 0
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
      else if (max === g) h = ((b - r) / d + 2) / 6
      else h = ((r - g) / d + 4) / 6
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
  }

  // Recalcula tríade + AA — chamado diretamente nos handlers (não via useEffect)
  const recalcular = useCallback((seed: string, marsala: boolean) => {
    const t = gerarTriade(seed, { manterMarsala: marsala })
    setTriade(t)
    onPreview?.(t)
    const aa = validarAA(t.tokens_light, t.tokens_dark)
    setAaOk(aa.ok)
    setAaFalhas(aa.falhas)
  }, [onPreview])

  // Calcula na montagem inicial (useState com inicializador — sem setState-in-effect)
  useState(() => { recalcular(sementeHsl, manterMarsala) })

  const handleSementeTexto = (val: string) => {
    setSementeHsl(val)
  }

  const handleColorPicker = (val: string) => {
    setSementeHsl(hexToHslStr(val))
  }

  const handleSalvar = async () => {
    if (!aaOk || !triade) return
    setSalvando(true)
    setErro(null)
    try {
      const result = await salvarPaleta({
        escopo: 'empresa',
        empresaId: empresaSelecionada || null,
        nome: empresas.find((e) => e.id === empresaSelecionada)?.nomeCanonico ?? 'Paleta',
        sementeHsl,
        manterMarsala,
      })
      if (result.ok) {
        toast.sucesso('Paleta salva.')
        onSalva?.(triade)
      } else {
        setErro(result.error ?? 'Não foi possível salvar a paleta. Tente novamente.')
        toast.erro(result.error ?? 'Não foi possível salvar a paleta. Tente novamente.')
      }
    } finally {
      setSalvando(false)
    }
  }

  const primaryLight = triade?.tokens_light['primary'] ?? '205 68% 33%'
  const accentLight  = triade?.tokens_light['accent']  ?? '345 62% 30%'
  const ringLight    = triade?.tokens_light['ring']     ?? '205 68% 33%'
  const podesSalvar  = aaOk === true && !salvando

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <span className="ubm-cota ubm-cota--muted">COR DA EMPRESA</span>
        <p style={{ fontSize: '0.88rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.2rem' }}>
          Escolha uma empresa e uma cor-semente; nós derivamos a paleta e conferimos a legibilidade.
        </p>
      </div>

      {/* Empresa */}
      <div className="ubm-step-field">
        <label htmlFor={empresaId} className="ubm-cota ubm-cota--muted" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.66rem' }}>
          Para qual empresa?
        </label>
        <div className="ubm-combobox">
          <div className="ubm-combobox-input-wrap">
            <select
              id={empresaId}
              className="ubm-combobox-input"
              role="combobox"
              aria-label="Empresa"
              value={empresaSelecionada}
              onChange={(e) => setEmpresaSelecionada(e.target.value)}
            >
              <option value="">Selecione a empresa…</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nomeCanonico}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Cor-semente */}
      <div className="ubm-seed-input ubm-step-field">
        <label className="ubm-cota ubm-cota--muted" style={{ fontSize: '0.66rem' }}>
          Cor-semente (HSL)
        </label>
        <div className="ubm-seed-input-row">
          {/* Color picker nativo (alternativa visual) */}
          <input
            id={colorId}
            type="color"
            className="ubm-seed-input-color"
            aria-label="Escolher cor-semente com seletor visual"
            value={hslToHex(sementeHsl)}
            onChange={(e) => handleColorPicker(e.target.value)}
            style={{ width: '2.5rem', height: '2.5rem' }}
          />
          {/* Campo HSL textual (alternativa acessível) */}
          <input
            id={seedId}
            type="text"
            className="ubm-seed-input-text"
            aria-label="Cor-semente em HSL (ex: 205 68% 33%)"
            placeholder="H S% L% — ex: 205 68% 33%"
            value={sementeHsl}
            onChange={(e) => handleSementeTexto(e.target.value)}
          />
          {/* Amostra ao vivo */}
          <div
            className="ubm-seed-input-preview"
            aria-hidden
            style={{ '--seed-color': sementeHsl } as React.CSSProperties}
          />
        </div>
        <span className="ubm-seed-input-mono">{sementeHsl}</span>

        {/* Toggle manter marsala */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', cursor: 'pointer', fontSize: '0.9rem' }}
        >
          <input
            id={marsalaId}
            type="checkbox"
            checked={manterMarsala}
            onChange={(e) => setManterMarsala(e.target.checked)}
            style={{ width: '1rem', height: '1rem', accentColor: 'hsl(var(--accent))' }}
            aria-label="Manter acento marsala (recomendado)"
          />
          <span style={{ color: 'hsl(var(--foreground))' }}>
            Manter acento marsala <span style={{ color: 'hsl(var(--muted-foreground))' }}>(recomendado)</span>
          </span>
        </label>
      </div>

      {/* Tríade ao vivo */}
      {triade && (
        <div>
          <span className="ubm-cota ubm-cota--muted" style={{ fontSize: '0.66rem', display: 'block', marginBottom: '0.4rem' }}>
            Tríade derivada
          </span>
          <div className="ubm-swatch-trio">
            <div className="ubm-swatch" style={{ '--swatch-color': primaryLight } as React.CSSProperties}>
              <div className="ubm-swatch-dot" />
              <span className="ubm-swatch-label">Primária</span>
              <span className="ubm-swatch-value">{primaryLight}</span>
            </div>
            <div className="ubm-swatch" style={{ '--swatch-color': accentLight } as React.CSSProperties}>
              <div className="ubm-swatch-dot" />
              <span className="ubm-swatch-label">Acento</span>
              <span className="ubm-swatch-value">{accentLight}</span>
            </div>
            <div className="ubm-swatch" style={{ '--swatch-color': ringLight } as React.CSSProperties}>
              <div className="ubm-swatch-dot" />
              <span className="ubm-swatch-label">Anel/Foco</span>
              <span className="ubm-swatch-value">{ringLight}</span>
            </div>
          </div>
        </div>
      )}

      {/* Resultado AA — aria-live para leitor de tela */}
      <div aria-live="polite" aria-atomic="true" id={aaLiveId}>
        {aaOk === true && (
          <span className="ubm-aa-badge ubm-aa-badge--ok">
            <CheckCircle size={13} aria-hidden />
            APROVADA EM AA
          </span>
        )}

        {aaOk === false && (
          <div>
            <span className="ubm-aa-badge ubm-aa-badge--fail">
              <AlertTriangle size={13} aria-hidden />
              REPROVADA EM AA
            </span>
            {aaFalhas.length > 0 && (
              <div className="ubm-aa-report" style={{ marginTop: '0.5rem' }}>
                <span className="ubm-aa-report-title">O que falhou:</span>
                {aaFalhas.map((f, i) => (
                  <span key={i} className="ubm-aa-report-item">· {f}</span>
                ))}
              </div>
            )}
            <p style={{ fontSize: '0.84rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.4rem' }}>
              Esta cor não passou no teste de leitura. Ajuste até passar em AA — não é possível publicar uma cor ilegível.
            </p>
          </div>
        )}
      </div>

      {/* Erro técnico ao salvar */}
      {erro && (
        <div className="ubm-error-piece" style={{ padding: '0.75rem 1rem' }}>
          <p style={{ color: 'hsl(var(--destructive))', fontSize: '0.88rem', margin: 0 }}>
            {erro}
          </p>
          <button
            type="button"
            className="ubm-btn ubm-btn-ghost"
            onClick={() => setErro(null)}
            style={{ marginTop: '0.35rem', height: '2rem', fontSize: '0.82rem' }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {/* CTAs */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="ubm-btn ubm-btn-primary"
          onClick={handleSalvar}
          disabled={!podesSalvar}
          aria-disabled={!podesSalvar}
          aria-describedby={!aaOk ? aaLiveId : undefined}
          aria-busy={salvando}
        >
          <Save size={15} aria-hidden />
          {salvando ? 'Salvando…' : 'Salvar paleta'}
        </button>
        {!aaOk && aaOk !== null && (
          <span style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
            Ajuste a cor até passar em AA — não é possível publicar uma cor ilegível.
          </span>
        )}
      </div>

    </div>
  )
}
