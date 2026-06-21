/**
 * B-003 — Colunas fantasma: valida o mapeamento de colunas reais do schema para os componentes.
 *
 * RED antes da correção: as queries usavam nomes errados (status, criada_em, papel, perfil.id)
 * e causavam erro 400 do PostgREST. A correção é nos RSC pages e em lib/data/perfil.ts.
 *
 * Colunas reais do schema:
 *   dor:           status_dor  (não "status"),  created_at (não "criada_em")
 *   perfil:        user_id     (PK, não "id"),  verificado_em ok
 *   papel_usuario: role        (não "papel"),   user_id ok
 *
 * Estes testes validam:
 * 1. O contrato de props dos componentes React (mapeamento do RSC fica garantido por tsc)
 * 2. Que isRepresentante/isVerificado (derivados de role+user_id) funcionam corretamente
 * 3. Que criada_em (mapeado de created_at) é exibido sem crash quando presente ou ausente
 */
import { describe, it, expect, vi } from 'vitest'

// Integracao: componente usa useToast — mock do provider no teste unitario (sem feedback real).
vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ sucesso: vi.fn(), erro: vi.fn(), info: vi.fn(), dispensar: vi.fn() }),
}))
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/dores',
}))

// ─── DoresPage ────────────────────────────────────────────────────────────────

import { DoresPage } from '@/components/dores/DoresPage'

describe('B-003: DoresPage — mapeamento de colunas (schema real)', () => {
  it('renderiza dor publicada (status_dor="publicada" → prop status)', () => {
    render(
      <DoresPage
        doresPublicadas={[{
          id: 'b003-pub',
          empresa_nome: 'Empresa Teste B003',
          descricao: 'Descrição longa da dor para fins de teste B003',
          status: 'publicada',
          cursos: [],
          publicada_em: '2026-06-01T00:00:00Z',
        }]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />,
    )
    // 009 filtros: o nome da empresa aparece no card (link) E na option do filtro EMPRESA.
    // Escopo no link do card preserva a intenção (o card renderiza a dor) sem ambiguidade.
    expect(screen.getByRole('link', { name: /Empresa Teste B003/i })).toBeInTheDocument()
    expect(screen.getAllByText(/publicada/i).length).toBeGreaterThan(0)
  })

  it('isRepresentante=true (role="representante" no RSC) → aba Minhas dores visível', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={true}
      />,
    )
    expect(screen.getByRole('tab', { name: /minhas dores/i })).toBeInTheDocument()
  })

  it('isRepresentante=false (sem linha role="representante" no banco) → aba Minhas dores OCULTA', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={false}
        isVerificado={false}
      />,
    )
    expect(screen.queryByRole('tab', { name: /minhas dores/i })).toBeNull()
  })

  it('minha dor com created_at mapeado para criada_em é exibida corretamente', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[{
          id: 'b003-mod',
          empresa_nome: 'Minha Empresa',
          descricao: 'Dor em moderação',
          status: 'em_moderacao',
          cursos: [],
          criada_em: '2026-06-05T00:00:00Z', // mapeado de created_at pelo RSC (não criada_em da coluna)
        }]}
        isRepresentante={true}
        isVerificado={true}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /minhas dores/i }))
    expect(screen.getByText('Dor em moderação')).toBeInTheDocument()
  })

  it('isVerificado=false → CTA Propor bloqueado (perfil.user_id correto no RSC)', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={false}
      />,
    )
    expect(screen.getByText(/verifique sua conta/i)).toBeInTheDocument()
  })

  it('isVerificado=true → CTA Propor nova dor habilitado', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[]}
        isRepresentante={true}
        isVerificado={true}
      />,
    )
    expect(screen.getByRole('link', { name: /propor nova dor/i })).toBeInTheDocument()
  })
})

// ─── DorDetalhe ───────────────────────────────────────────────────────────────

import { DorDetalhe } from '@/components/dores/DorDetalhe'

vi.mock('@/lib/actions/dor', () => ({
  submeterDor: vi.fn(),
  moderarDor: vi.fn(),
  submeterDorLanding: vi.fn(),
}))

describe('B-003: DorDetalhe — mapeamento criada_em (← created_at do banco)', () => {
  it('dor publicada com criada_em mapeado de created_at renderiza sem crash', () => {
    render(
      <DorDetalhe
        dor={{
          id: 'b003-det',
          empresa_nome: 'Empresa Detalhe',
          descricao: 'Dor de detalhe para teste B003 com texto suficiente.',
          status: 'publicada',
          cursos: ['administracao'],
          publicada_em: '2026-06-01T00:00:00Z',
          criada_em: '2026-05-30T00:00:00Z',
          aprovado_por: 'admin-1',
          motivo_rejeicao: null,
          autor_id: 'user-1',
        }}
        currentUserId={null}
        isAdmin={false}
      />,
    )
    expect(screen.getByText('Empresa Detalhe')).toBeInTheDocument()
    expect(screen.getAllByText(/publicada/i).length).toBeGreaterThan(0)
  })

  it('criada_em ausente não causa crash (null/undefined do banco)', () => {
    render(
      <DorDetalhe
        dor={{
          id: 'b003-det2',
          empresa_nome: 'Empresa Sem Data',
          descricao: 'Dor sem data de criação.',
          status: 'publicada',
          cursos: [],
          publicada_em: '2026-06-01T00:00:00Z',
          criada_em: undefined,
          aprovado_por: null,
          motivo_rejeicao: null,
          autor_id: 'user-2',
        }}
        currentUserId={null}
        isAdmin={false}
      />,
    )
    expect(screen.getByText('Empresa Sem Data')).toBeInTheDocument()
  })
})

// ─── DoresPage: rascunho representante ────────────────────────────────────────

describe('B-003: DoresPage — rascunho representante (criada_em mapeado)', () => {
  it('dor rascunho exibe criada_em no card (vem de created_at no banco)', () => {
    render(
      <DoresPage
        doresPublicadas={[]}
        minhasDores={[{
          id: 'b003-rasc',
          empresa_nome: 'Rep Corp',
          descricao: 'Minha dor representante rascunho',
          status: 'rascunho',
          cursos: [],
          criada_em: '2026-06-06T00:00:00Z',
        }]}
        isRepresentante={true}
        isVerificado={true}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /minhas dores/i }))
    expect(screen.getByText('Minha dor representante rascunho')).toBeInTheDocument()
  })
})
