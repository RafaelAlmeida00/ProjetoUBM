/**
 * 009 T16 (RN14/CA7) — resolverDeepLink consolida todos os destinos em /app/dores.
 * Nenhum link aponta para rota morta (/app/projetos*, /app/indicacoes).
 */
import { describe, it, expect } from 'vitest'
import { resolverDeepLink } from '@/lib/notificacoes/deep-link'

const MAPA = new Map<string, string>([['proj-1', 'dor-1']])

describe('resolverDeepLink (009 T16)', () => {
  it('equipe_fechada com projeto resolvido → /app/dores/<dor_id>', () => {
    expect(resolverDeepLink('status_mudou', { evento: 'equipe_fechada', projeto_id: 'proj-1' }, MAPA))
      .toBe('/app/dores/dor-1')
  })

  it('eleito_host com projeto resolvido → /app/dores/<dor_id>', () => {
    expect(resolverDeepLink('status_mudou', { evento: 'eleito_host', projeto_id: 'proj-1' }, MAPA))
      .toBe('/app/dores/dor-1')
  })

  it('projeto_avancou com projeto resolvido → /app/dores/<dor_id>', () => {
    expect(resolverDeepLink('status_mudou', { evento: 'projeto_avancou', projeto_id: 'proj-1', para_status: 'aprovado' }, MAPA))
      .toBe('/app/dores/dor-1')
  })

  it('status_mudou (base 002) com projeto resolvido → /app/dores/<dor_id>', () => {
    expect(resolverDeepLink('status_mudou', { projeto_id: 'proj-1' }, MAPA))
      .toBe('/app/dores/dor-1')
  })

  it('projeto não resolvido (mapa vazio) → /app/dores (vitrine, sem rota morta)', () => {
    expect(resolverDeepLink('status_mudou', { evento: 'eleito_host', projeto_id: 'proj-x' }, new Map()))
      .toBe('/app/dores')
  })

  it('projeto_aberto → /app/dores (indicar-se inline na vitrine)', () => {
    expect(resolverDeepLink('dor_aprovada_curso', { evento: 'projeto_aberto', curso: 'Eng' }, MAPA))
      .toBe('/app/dores')
  })

  it('dor_aprovada_curso → /app/dores', () => {
    expect(resolverDeepLink('dor_aprovada_curso', null, MAPA)).toBe('/app/dores')
  })

  it('tipo desconhecido → fallback /app/dores (nunca rota morta)', () => {
    const link = resolverDeepLink('tipo_qualquer', null, MAPA)
    expect(link.startsWith('/app/projetos')).toBe(false)
    expect(link.startsWith('/app/indicacoes')).toBe(false)
    expect(link).toBe('/app/dores')
  })
})
