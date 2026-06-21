/**
 * 009 T18 (RN6/CA12/CA15) — vitrine /app/dores: seção AGREGADA gated "Indicações recebidas".
 * Coord-do-curso/admin com ≥1 indicação cross-projeto → seção colapsada reúne os grupos.
 * Por RETORNO, não por claim (CA15): agregado vazio → seção não aparece.
 * Gate-de-fetch no SERVIDOR: aluno/representante nunca disparam listarIndicacoes (zero PII).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Parte 1 — componente DoresPage (render) ────────────────────────────────────
describe('DoresPage — seção agregada (T18 render)', () => {
  it('com indicacoesAgregadas não-vazio → renderiza "Indicações recebidas" + nomes', async () => {
    const { render, screen } = await import('@testing-library/react')
    const React = (await import('react')).default
    vi.resetModules()
    const { DoresPage } = await import('@/components/dores/DoresPage')
    render(
      React.createElement(DoresPage, {
        doresPublicadas: [], minhasDores: [], isRepresentante: false, isVerificado: false,
        indicacoesAgregadas: [{
          projetoId: 'p1', rotulo: 'Automação — Nissan',
          indicacoes: [{
            id: 'i1', projeto_id: 'p1', pessoa_id: 'u1', papel_pretendido: 'aluno', mensagem: null,
            created_at: '2026-01-01T00:00:00Z', deleted_at: null, aluno_nome: 'Rafael', aluno_email: 'r@e', curso: 'Eng',
          }],
        }],
      }),
    )
    expect(screen.getByText('Indicações recebidas')).toBeInTheDocument()
    expect(screen.getByText(/Rafael/)).toBeInTheDocument()
  })

  it('com indicacoesAgregadas vazio/undefined → seção NÃO aparece', async () => {
    const { render, screen } = await import('@testing-library/react')
    const React = (await import('react')).default
    const { DoresPage } = await import('@/components/dores/DoresPage')
    const { unmount } = render(
      React.createElement(DoresPage, { doresPublicadas: [], minhasDores: [], isRepresentante: false, isVerificado: false, indicacoesAgregadas: [] }),
    )
    expect(screen.queryByText('Indicações recebidas')).toBeNull()
    unmount()
    render(React.createElement(DoresPage, { doresPublicadas: [], minhasDores: [], isRepresentante: false, isVerificado: false }))
    expect(screen.queryByText('Indicações recebidas')).toBeNull()
  })
})
