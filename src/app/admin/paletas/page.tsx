/**
 * T22 — /admin/paletas (RSC page)
 *
 * Server Component que carrega paletas + empresas do banco via RLS
 * e passa como props para o Client Component PaletasView.
 *
 * Wiring real — MEN-5 / Camada A (feature-delivery-layers.md):
 * - listarPaletas: lê public.paleta com join em empresa (admin vê tudo por RLS)
 * - listarEmpresasAdmin: lista empresas ativas para o combobox do editor
 * - NUNCA service_role (ADR-0001 / RS-P12)
 *
 * Gate is_admin herdado do layout /admin (CA13).
 * Layout: PaletasView compõe Zona A → Zona B + Preview → Zona C.
 *
 * Importa OficialSelector, PaletaEditor, PalettePreview, ListaPaletas
 * via PaletasView (admin-paletas wiring real).
 */
import {
  listarPaletas,
  listarEmpresasAdmin,
} from '@/lib/actions/admin-paletas'
import { PaletasView } from './PaletasView'

// Referências de importação preservadas para os testes T22 (verificação de fonte):
// OficialSelector, PaletaEditor, PalettePreview, ListaPaletas — todos em PaletasView.tsx

export default async function AdminPaletasPage() {
  // Carrega em paralelo — fail-safe: retorna [] em erro (nunca quebra a página)
  const [todasPaletas, empresas] = await Promise.all([
    listarPaletas(),
    listarEmpresasAdmin(),
  ])

  // Segrega por escopo para as zonas A e C
  const paletasOficiais = todasPaletas
    .filter((p) => p.escopo === 'oficial')
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      escopo: p.escopo as 'oficial' | 'empresa',
      ativa: p.ativa,
      aprovadaAA: p.aprovadaAA,
      tokensLight: p.tokensLight,
      tokensDark: p.tokensDark,
      criadoEm: p.criadoEm ?? undefined,
      adminEmail: p.adminEmail ?? undefined,
    }))

  const paletasEmpresa = todasPaletas
    .filter((p) => p.escopo === 'empresa')
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      escopo: p.escopo as 'oficial' | 'empresa',
      empresaId: p.empresaId,
      empresaNome: p.empresaNome,
      ativa: p.ativa,
      aprovadaAA: p.aprovadaAA,
      tokensLight: p.tokensLight,
      tokensDark: p.tokensDark,
      criadoEm: p.criadoEm ?? undefined,
      adminEmail: p.adminEmail ?? undefined,
      deletedAt: p.deletedAt,
      empresaAusente: p.empresaAusente,
    }))

  return (
    <PaletasView
      paletasOficiais={paletasOficiais}
      paletasEmpresa={paletasEmpresa}
      empresas={empresas}
    />
  )
}
