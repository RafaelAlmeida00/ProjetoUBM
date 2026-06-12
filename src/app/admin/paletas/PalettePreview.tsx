'use client'
/**
 * T20 — PalettePreview (zona de preview)
 *
 * Aplica as vars da tríade APENAS no contêiner .ubm-preview-frame via
 * style inline escopado — NUNCA em :root/<html> (CA18 / design §5.3).
 * Sair do editor sem ativar NÃO chama nenhuma action.
 *
 * Guard-rail 2 do design: vars do preview ficam na moldura, não vazam.
 */
import { useState } from 'react'
import type { TriadeResult } from '@/lib/theming/paleta-core'

interface PalettePreviewProps {
  triade: TriadeResult | null
}

export function PalettePreview({ triade }: PalettePreviewProps) {
  const [modoEscuro, setModoEscuro] = useState(false)

  // Tokens ativos (light ou dark) — escopados ao contêiner
  const tokens = triade
    ? (modoEscuro ? triade.tokens_dark : triade.tokens_light)
    : null

  // CSS vars inline escopadas ao frame (NUNCA ao :root/<html>)
  const inlineVars: React.CSSProperties = tokens
    ? ({
        '--primary': tokens['primary'] ? `hsl(${tokens['primary']})` : undefined,
        '--primary-foreground': tokens['primary-foreground'] ? `hsl(${tokens['primary-foreground']})` : undefined,
        '--accent': tokens['accent'] ? `hsl(${tokens['accent']})` : undefined,
        '--accent-foreground': tokens['accent-foreground'] ? `hsl(${tokens['accent-foreground']})` : undefined,
        '--ring': tokens['ring'] ? `hsl(${tokens['ring']})` : undefined,
      } as React.CSSProperties)
    : {}

  return (
    <div
      className="ubm-preview-frame"
      aria-label="Pré-visualização da paleta (não publicada)"
      style={inlineVars}
    >
      {/* Cota + toggle claro/escuro */}
      <div className="ubm-preview-frame-cota">
        <span className="ubm-preview-frame-label">Pré-visualização · Não publicado</span>
        {triade && (
          <button
            type="button"
            className="ubm-btn ubm-btn-ghost"
            style={{ height: '1.8rem', fontSize: '0.72rem', padding: '0 0.6rem' }}
            onClick={() => setModoEscuro((v) => !v)}
            aria-label={modoEscuro ? 'Ver no modo claro' : 'Ver no modo escuro'}
          >
            {modoEscuro ? '☀ Claro' : '🌙 Escuro'}
          </button>
        )}
      </div>

      {/* Conteúdo: estado vazio ou mockup */}
      {!triade ? (
        <div className="ubm-empty" style={{ padding: '1.5rem 0.5rem' }}>
          <div className="ubm-empty-node" aria-hidden />
          <p className="ubm-empty-msg" style={{ fontSize: '0.85rem' }}>
            A pré-visualização aparece aqui quando você escolhe uma cor.
          </p>
        </div>
      ) : (
        <div
          className="ubm-preview-frame-inner"
          data-theme={modoEscuro ? 'dark' : undefined}
          style={{ background: modoEscuro ? 'hsl(218 32% 9%)' : undefined }}
        >
          {/* Mini header com cor primária escopada */}
          <div className="ubm-preview-frame-header">
            <div className="ubm-preview-frame-header-dot" aria-hidden />
            <span className="ubm-preview-frame-header-title">Plataforma UBM</span>
          </div>

          {/* Mini card de exemplo */}
          <div
            className="ubm-machined"
            style={{
              padding: '0.5rem 0.75rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
            }}
          >
            <div>
              <p
                className="font-display"
                style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--foreground))', margin: 0 }}
              >
                Empresa Exemplo
              </p>
              <p style={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                Dor de demonstração
              </p>
            </div>
            <span className="ubm-status ubm-status--aprovada" style={{ fontSize: '0.6rem' }}>
              APROVADA
            </span>
          </div>

          {/* Mini botão primário (usa --primary escopado) */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="ubm-btn ubm-btn-primary"
              style={{ height: '2rem', fontSize: '0.72rem', padding: '0 0.75rem' }}
              aria-label="Botão de exemplo (pré-visualização)"
              tabIndex={-1}
            >
              Ação primária
            </button>
            <a
              className="ubm-link"
              href="#preview"
              onClick={(e) => e.preventDefault()}
              style={{ fontSize: '0.75rem' }}
              tabIndex={-1}
            >
              Link de exemplo
            </a>
          </div>

          {/* Nota de não-publicação */}
          <p
            style={{
              fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))',
              fontFamily: 'var(--font-mono), monospace', textAlign: 'center',
              borderTop: '1px solid hsl(var(--border))', paddingTop: '0.4rem', margin: 0,
            }}
          >
            É só você vendo. Ninguém mais foi afetado.
          </p>
        </div>
      )}
    </div>
  )
}
