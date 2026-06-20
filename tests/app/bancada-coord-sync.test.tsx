/**
 * Fase 4 — Bancada do coordenador sincronizada.
 * Host (de projeto aberto) tem CTA que leva a COMPOR a equipe; sem host, só "Ver indicações"
 * (não promete "revisar" o que ele não pode). A contagem já vem filtrada do RSC (em_analise +
 * exclui a própria indicação) — aqui validamos a derivação do CTA pelo hostProjetoId.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/app' }))

import { BancadaCoordenador } from '@/components/app/Bancada'
import type { Indicacao } from '@/lib/data/projetos'

const IND = (id: string, pessoa: string): Indicacao => ({
  id, projeto_id: 'p1', pessoa_id: pessoa, papel_pretendido: 'aluno', mensagem: null,
  created_at: '2026-01-01T00:00:00Z', deleted_at: null, aluno_nome: 'Aluno', aluno_email: 'a@a', curso: 'Direito',
})

describe('BancadaCoordenador — sync (Fase 4)', () => {
  it('host de projeto aberto: CTA "Compor equipe" aponta para o projeto', () => {
    render(<BancadaCoordenador nome="Ana" indicacoes={[IND('i1', 'a1')]} hostProjetoId="proj-9" />)
    expect(screen.getByRole('link', { name: /compor equipe/i })).toHaveAttribute('href', '/app/projetos/proj-9')
  })

  it('sem ser host: CTA "Ver indicações" (não promete revisar o que não pode)', () => {
    render(<BancadaCoordenador nome="Ana" indicacoes={[IND('i1', 'a1')]} />)
    expect(screen.getByRole('link', { name: /ver indicações/i })).toHaveAttribute('href', '/app/indicacoes')
    expect(screen.queryByRole('link', { name: /compor equipe/i })).toBeNull()
  })
})
