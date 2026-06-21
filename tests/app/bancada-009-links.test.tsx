/**
 * 009 T15 (RN14/RN15/CA7) — a Bancada não aponta para rotas mortas.
 * Após a consolidação, nenhum href das 4 bancadas pode apontar para /app/projetos*,
 * /app/projetos/[id] ou /app/indicacoes. O representante navega para a dor por
 * /app/dores/<dor_id>. Garante "sem rota morta" em todos os papéis.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/app' }))

import {
  BancadaRepresentante,
  BancadaAluno,
  BancadaCoordenador,
  BancadaAdmin,
} from '@/components/app/Bancada'
import type { MeuProjeto, MinhaIndicacao, TarefaAberta, Indicacao } from '@/lib/data/projetos'

const ROTAS_MORTAS = ['/app/projetos', '/app/indicacoes']
function semRotaMorta() {
  const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '')
  for (const h of hrefs) {
    for (const morta of ROTAS_MORTAS) {
      expect(h.startsWith(morta)).toBe(false)
    }
  }
  return hrefs
}

const PROJ: MeuProjeto = { projeto_id: 'p1', dor_id: 'dor-1', status: 'em_analise', empresa_nome: 'Nissan', papel_projeto: 'host' }
const CONT = { rascunho: 0, em_moderacao: 1, publicada: 2, arquivada: 0, total: 3 }
const MINHA_IND: MinhaIndicacao = { id: 'i1', projeto_id: 'p1', papel_pretendido: 'aluno', created_at: '2026-01-01T00:00:00Z' }
const TAREFA: TarefaAberta = { id: 't1', projeto_id: 'p1', titulo: 'X', descricao: null, created_at: '2026-01-01T00:00:00Z' }
const IND: Indicacao = {
  id: 'i1', projeto_id: 'p1', pessoa_id: 'u1', papel_pretendido: 'aluno', mensagem: null,
  created_at: '2026-01-01T00:00:00Z', deleted_at: null, aluno_nome: 'A', aluno_email: 'a@a', curso: 'Eng',
}

describe('009 T15 — Bancada sem rota morta', () => {
  it('representante: links só para /app/dores* (item de projeto usa /app/dores/<dor_id>)', () => {
    render(<BancadaRepresentante nome="R" meusProjetos={[PROJ]} contagemDores={CONT} />)
    const hrefs = semRotaMorta()
    expect(hrefs).toContain('/app/dores/dor-1')
  })

  it('aluno: atalhos não apontam para rota morta', () => {
    render(<BancadaAluno nome="A" indicacoes={[MINHA_IND]} tarefas={[TAREFA]} />)
    semRotaMorta()
  })

  it('coordenador (host): nenhum href morto; Compor equipe usa a dor', () => {
    render(<BancadaCoordenador nome="C" indicacoes={[IND]} hostDorId="dor-1" />)
    const hrefs = semRotaMorta()
    expect(hrefs).toContain('/app/dores/dor-1')
  })

  it('admin (com projetos pendentes): nenhum href morto', () => {
    render(<BancadaAdmin nome="Adm" qtdDoresPendentes={2} qtdProjetosPendentes={3} />)
    semRotaMorta()
  })
})
