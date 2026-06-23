import { OutrosNeutro } from './OutrosNeutro'

export interface ItemPodio {
  posicao: number
  nome_publico: string | null
  rotulo: string
  projetos_finalizados: number
  count: number
}

interface PodioRankingProps {
  itens: ItemPodio[]
  titulo: string
  /** Contagem de participantes suprimidos (grupos <5) */
  outrosCount?: number
  /** Borda: 'primary' = azul DOR (alunos/coord), 'accent' = marsala (empresas) */
  territorio?: 'primary' | 'accent'
}

/**
 * Pódio de honra (design §5.1 / CA16/CA18).
 * Lista ordenada, sem PII (só nome_publico, rótulo, contagem).
 * Acessível: <ol>, posições anunciam "N° lugar, nome, X finalizados".
 */
export function PodioRanking({
  itens,
  titulo,
  outrosCount = 0,
  territorio = 'primary',
}: PodioRankingProps) {
  const corBorda = territorio === 'accent' ? 'hsl(var(--accent))' : 'hsl(var(--primary))'

  return (
    <section className="ubm-bancada-bloco" aria-labelledby={`podio-titulo-${titulo}`}>
      <h3
        id={`podio-titulo-${titulo}`}
        className="ubm-cota"
        style={{ marginBottom: '1rem' }}
      >
        {titulo}
      </h3>
      <ol
        role="list"
        className="ubm-podium"
      >
        {itens.map((item) => {
          const isPrimeiro = item.posicao === 1
          const nomeMostrado = item.nome_publico ?? item.rotulo
          const posicaoStr = `#${String(item.posicao).padStart(2, '0')}`

          return (
            <li
              key={item.posicao}
              className={`ubm-podium-item${isPrimeiro ? ' ubm-machined' : ''}`}
              aria-label={`${item.posicao}º lugar, ${nomeMostrado}, ${item.projetos_finalizados} projetos finalizados`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: isPrimeiro ? '0.85rem 1rem' : '0.55rem 0.75rem',
                borderLeft: `3px solid ${corBorda}`,
                borderRadius: '2px',
                background: isPrimeiro ? 'hsl(var(--card))' : undefined,
                boxShadow: isPrimeiro ? 'var(--shadow-sm)' : undefined,
              }}
            >
              <span
                className="ubm-podium-rank font-mono"
                aria-hidden="true"
                style={{
                  fontSize: isPrimeiro ? '1.2rem' : '0.9rem',
                  fontWeight: 700,
                  color: isPrimeiro ? `hsl(${territorio === 'accent' ? 'var(--accent)' : 'var(--primary)'})` : 'hsl(var(--muted-foreground))',
                  minWidth: '2.5rem',
                }}
              >
                {posicaoStr}
              </span>
              <span
                className={isPrimeiro ? 'font-display' : ''}
                style={{
                  flex: 1,
                  fontWeight: isPrimeiro ? 600 : 400,
                  fontSize: isPrimeiro ? '1.05rem' : '0.92rem',
                }}
              >
                {nomeMostrado}
              </span>
              <span
                className="ubm-cota ubm-cota--muted"
                style={{ whiteSpace: 'nowrap' }}
              >
                {item.projetos_finalizados} finalizados
              </span>
            </li>
          )
        })}
      </ol>
      {outrosCount > 0 && <OutrosNeutro count={outrosCount} />}
    </section>
  )
}
