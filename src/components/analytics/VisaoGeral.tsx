import { FrescorBadge } from './FrescorBadge'
import { EmptyState } from './EmptyState'
import { LoadingState } from './LoadingState'
import type { VisaoGeral as VisaoGeralDados } from '@/lib/data/analytics'

type ResultadoVisaoGeral =
  | { dados: VisaoGeralDados; locked: false }
  | { dados: null; locked: true }
  | { dados: null; locked: false; erro: true }
  | { dados: null; locked: false }

interface VisaoGeralProps {
  resultado: ResultadoVisaoGeral
  carregando?: boolean
}

/**
 * Bloco B3 — Visão Geral filtrada (Velocidade B — COM carimbo — CA6/CA7/CA8).
 * Coordenador → só seus cursos; Admin → tudo. Aluno → negado (.ubm-locked).
 * design §6.3.
 */
export function VisaoGeral({ resultado, carregando }: VisaoGeralProps) {
  if (carregando) return <LoadingState mensagem="Somando as entregas…" />

  // Estado negado (CA8) — .ubm-locked
  if (resultado.locked) {
    return (
      <div className="ubm-locked ubm-machined" style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p className="ubm-cota ubm-cota--muted" style={{ marginBottom: '0.5rem' }}>
          ACESSO RESTRITO
        </p>
        <p style={{ color: 'hsl(var(--muted-foreground))', maxWidth: '40ch', margin: '0 auto' }}>
          Esta visão é para coordenação.
        </p>
      </div>
    )
  }

  // Estado de erro técnico
  if ('erro' in resultado && resultado.erro) {
    return (
      <div className="ubm-error-piece ubm-machined" style={{ padding: '1.5rem' }}>
        <p className="ubm-error-piece-title">Não conseguimos carregar a visão geral.</p>
        <p className="ubm-error-piece-msg">Tente recarregar a página.</p>
      </div>
    )
  }

  const dados = resultado.dados

  if (!dados || dados.itens.length === 0) {
    return (
      <div className="ubm-bancada-bloco">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <h2 className="ubm-cota">VISÃO GERAL</h2>
          {/* Carimbo obrigatório Velocidade B (CA10) */}
          <FrescorBadge atualizado_em={dados?.atualizado_em ?? null} />
        </div>
        <EmptyState
          titulo="Seus cursos ainda não têm projetos."
          mensagem="Quando projetos forem criados para seus cursos, os números aparecem aqui."
        />
      </div>
    )
  }

  return (
    <div className="ubm-bancada-bloco">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <h2 className="ubm-cota">VISÃO GERAL</h2>
        {/* Carimbo obrigatório Velocidade B (CA10) */}
        <FrescorBadge atualizado_em={dados.atualizado_em} />
      </div>

      {/* Tabela por curso — acessível com cabeçalhos reais */}
      <div style={{ overflowX: 'auto' }}>
        <table
          className="ubm-machined"
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}
        >
          <thead>
            <tr>
              {(['Curso', 'Total', 'Finalizados', 'Alunos envolvidos', 'Taxa'] as const).map((h) => (
                <th
                  key={h}
                  className="ubm-cota ubm-cota--muted"
                  style={{ padding: '0.6rem 0.85rem', textAlign: 'left', borderBottom: '1px solid hsl(var(--border))', fontWeight: 600 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.itens.map((item) => (
              <tr key={item.curso} style={{ borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
                <td style={{ padding: '0.65rem 0.85rem', fontWeight: 500 }}>{item.curso}</td>
                <td style={{ padding: '0.65rem 0.85rem' }}>{item.total_projetos}</td>
                <td style={{ padding: '0.65rem 0.85rem', color: 'hsl(var(--accent))', fontWeight: 600 }}>
                  {item.finalizados}
                </td>
                <td style={{ padding: '0.65rem 0.85rem' }}>{item.alunos_envolvidos}</td>
                <td style={{ padding: '0.65rem 0.85rem' }}>
                  {/* barra de progresso acessível */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <progress
                      value={item.taxa_finalizacao}
                      max={100}
                      role="progressbar"
                      aria-valuenow={item.taxa_finalizacao}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Taxa de finalização: ${item.taxa_finalizacao}%`}
                      style={{ width: '4rem', accentColor: 'hsl(var(--accent))' }}
                    />
                    <span>{item.taxa_finalizacao}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
