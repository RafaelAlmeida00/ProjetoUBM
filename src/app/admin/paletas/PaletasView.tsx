'use client'
/**
 * PaletasView — Client Component orquestrador da tela /admin/paletas
 *
 * Recebe dados reais como props (carregados pelo RSC page.tsx) e
 * orquestra o estado entre as 3 zonas + preview.
 * Separado do page.tsx para permitir testes RTL (RTL não renderiza RSC async).
 *
 * MEN-5 wiring real — Camada A feature-delivery-layers.md
 * T22b: testável via RTL com props diretas (sem mock de RSC).
 */
import { useState, useCallback } from 'react'
import { OficialSelector } from './OficialSelector'
import { PaletaEditor } from './PaletaEditor'
import { PalettePreview } from './PalettePreview'
import { ListaPaletas } from './ListaPaletas'
import type { PaletaOficial } from './OficialSelector'
import type { PaletaItem } from './ListaPaletas'
import type { TriadeResult } from '@/lib/theming/paleta-core'

export interface Empresa {
  id: string
  nomeCanonico: string
}

export interface PaletasViewProps {
  paletasOficiais: PaletaOficial[]
  paletasEmpresa: PaletaItem[]
  empresas: Empresa[]
}

export function PaletasView({
  paletasOficiais,
  paletasEmpresa,
  empresas,
}: PaletasViewProps) {
  // Estado da tríade candidata (preview ao vivo do editor)
  const [triade, setTriade] = useState<TriadeResult | null>(null)

  // Estado local das paletas (para reflectir exclusões/restaurações sem reload)
  const [oficiais, setOficiais] = useState<PaletaOficial[]>(paletasOficiais)
  const [empresa, setEmpresa] = useState<PaletaItem[]>(paletasEmpresa)

  const handleOficialAtivada = useCallback((id: string) => {
    setOficiais((prev) =>
      prev.map((p) => ({ ...p, ativa: p.id === id })),
    )
  }, [])

  const handlePaletaSalva = useCallback((novaTriade: TriadeResult) => {
    setTriade(novaTriade)
  }, [])

  const handlePreview = useCallback((t: TriadeResult | null) => {
    setTriade(t)
  }, [])

  const handleExcluida = useCallback((id: string) => {
    setEmpresa((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, deletedAt: new Date().toISOString(), ativa: false } : p,
      ),
    )
  }, [])

  const handleRestaurada = useCallback((id: string) => {
    setEmpresa((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, deletedAt: null } : p,
      ),
    )
  }, [])

  return (
    <div style={{ padding: 'clamp(1.25rem, 4vw, 2rem)', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Cabeçalho breadcrumb */}
      <div>
        <span className="ubm-cota">
          ADMIN / <b>PALETAS</b>
        </span>
        <h1
          className="font-display"
          style={{
            fontSize: 'clamp(1.4rem, 3vw, 1.9rem)',
            fontWeight: 600,
            marginTop: '0.35rem',
            marginBottom: 0,
            color: 'hsl(var(--foreground))',
          }}
        >
          Gestão de Paletas
        </h1>
      </div>

      {/* ── Zona A: Oficial ativa site-wide ── */}
      <section
        className="ubm-machined"
        style={{ padding: 'clamp(1rem, 3vw, 1.5rem)' }}
        aria-labelledby="zona-a-titulo"
      >
        <h2
          id="zona-a-titulo"
          className="ubm-cota"
          style={{ marginBottom: '1rem', display: 'block' }}
        >
          Oficial do site
        </h2>
        <OficialSelector
          paletas={oficiais}
          onAtivada={handleOficialAtivada}
        />
      </section>

      {/* ── Zonas B + Preview: Editor + Pré-visualização (lado a lado no desktop) ── */}
      <div
        style={{
          display: 'grid',
          gap: '1.25rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))',
          alignItems: 'start',
        }}
      >
        {/* Zona B: Editor */}
        <section
          className="ubm-machined"
          style={{ padding: 'clamp(1rem, 3vw, 1.5rem)' }}
          aria-labelledby="zona-b-titulo"
        >
          <h2
            id="zona-b-titulo"
            className="ubm-cota"
            style={{ marginBottom: '1rem', display: 'block' }}
          >
            Cor de empresa
          </h2>
          <PaletaEditor
            empresas={empresas}
            onSalva={handlePaletaSalva}
            onPreview={handlePreview}
          />
        </section>

        {/* Preview ao vivo */}
        <section aria-labelledby="zona-preview-titulo">
          <h2
            id="zona-preview-titulo"
            className="ubm-cota ubm-cota--muted"
            style={{ marginBottom: '0.5rem', display: 'block' }}
          >
            Pré-visualização
          </h2>
          <PalettePreview triade={triade} />
        </section>
      </div>

      {/* ── Zona C: Lista de paletas ── */}
      <section
        className="ubm-machined"
        style={{ padding: 'clamp(1rem, 3vw, 1.5rem)' }}
        aria-labelledby="zona-c-titulo"
      >
        <h2
          id="zona-c-titulo"
          className="ubm-cota"
          style={{ marginBottom: '1rem', display: 'block' }}
        >
          Todas as paletas
        </h2>
        <ListaPaletas
          oficiais={oficiais as unknown as PaletaItem[]}
          empresa={empresa}
          onExcluida={handleExcluida}
          onRestaurada={handleRestaurada}
        />
      </section>
    </div>
  )
}
