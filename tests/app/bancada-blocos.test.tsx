import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the data adapters
vi.mock('@/lib/data/analytics', () => ({
  obterMeuResumo: vi.fn().mockResolvedValue({
    minhas_dores_publicadas: 2,
    projetos_membro_execucao: 1,
    projetos_membro_finalizados: 0,
    minhas_tarefas_abertas: 3,
  }),
  obterPainelEmpresa: vi.fn().mockResolvedValue({
    dores_rascunho: 0,
    dores_em_moderacao: 1,
    dores_publicadas: 3,
    projetos_derivados: 2,
    projetos_finalizados: 0,
    total_projetos: 2,
  }),
  obterVisaoGeral: vi.fn().mockResolvedValue({
    dados: { itens: [], atualizado_em: null },
    locked: false,
  }),
}))

// Test each role component directly (simpler than testing the full RSC page)
import { PainelPessoal } from '@/components/analytics/PainelPessoal'
import { PainelEmpresa } from '@/components/analytics/PainelEmpresa'
import { VisaoGeral } from '@/components/analytics/VisaoGeral'

const dadosPessoal = {
  minhas_dores_publicadas: 2,
  projetos_membro_execucao: 1,
  projetos_membro_finalizados: 0,
  minhas_tarefas_abertas: 3,
}

const dadosEmpresa = {
  dores_rascunho: 0,
  dores_em_moderacao: 1,
  dores_publicadas: 3,
  projetos_derivados: 2,
  projetos_finalizados: 0,
  total_projetos: 2,
}

describe('Bancada blocos por papel', () => {
  it('PainelPessoal renderiza KPIs sem FrescorBadge (aluno/todos os papéis)', () => {
    const { container } = render(<PainelPessoal dados={dadosPessoal} />)
    expect(screen.getByText(/MEU PAINEL/i)).toBeInTheDocument()
    // Sem carimbo (Velocidade A — CA3)
    expect(container.querySelector('[role="status"]')).not.toBeInTheDocument()
    expect(container.querySelector('.ubm-data-stamp')).not.toBeInTheDocument()
  })

  it('PainelEmpresa renderiza sem FrescorBadge e sem nome de aluno (representante)', () => {
    const { container } = render(<PainelEmpresa dados={dadosEmpresa} />)
    expect(screen.getByText(/PAINEL DA EMPRESA/i)).toBeInTheDocument()
    // Sem carimbo (Velocidade A — CA3)
    expect(container.querySelector('[role="status"]')).not.toBeInTheDocument()
    // Nenhum slot de nome de aluno
    expect(container.innerHTML).not.toMatch(/aluno_nome|nome_aluno|membro_nome/i)
  })

  it('VisaoGeral exibe FrescorBadge quando há dados (Velocidade B — coordenador/admin)', () => {
    const atualizado = new Date(Date.now() - 15 * 60_000).toISOString()
    render(
      <VisaoGeral
        resultado={{
          dados: {
            itens: [{ curso: 'Eng. de Software', total_projetos: 5, finalizados: 3, alunos_envolvidos: 12, taxa_finalizacao: 60 }],
            atualizado_em: atualizado,
          },
          locked: false,
        }}
      />
    )
    expect(screen.getByRole('status')).toBeInTheDocument() // FrescorBadge presente
  })

  it('aluno negado em VisaoGeral → .ubm-locked sem dado', () => {
    const { container } = render(
      <VisaoGeral resultado={{ dados: null, locked: true }} />
    )
    expect(container.querySelector('.ubm-locked')).toBeInTheDocument()
    expect(container.querySelector('table')).not.toBeInTheDocument()
    expect(container.querySelector('[role="status"]')).not.toBeInTheDocument()
  })

  it('nenhum caminho usa createSupabaseAdminClient/service_role key (CA22)', () => {
    // Verifica estruturalmente que o adapter não chama createSupabaseAdminClient
    // (que usa a service_role key) — só createSupabaseServerClient (anon+RLS).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs')
    const path = require('path')
    const srcPath = path.resolve(__dirname, '../../src/lib/data/analytics.ts')
    const source = fs.readFileSync(srcPath, 'utf-8')
    // A service_role pode aparecer em comentários (proibido usar como key ou em createAdmin)
    expect(source).not.toContain('createSupabaseAdminClient')
    expect(source).not.toMatch(/process\.env\.SUPABASE_SERVICE_ROLE/)
    // Deve usar apenas createSupabaseServerClient (anon key + RLS)
    expect(source).toContain('createSupabaseServerClient')
  })
})
