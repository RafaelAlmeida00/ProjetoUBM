/**
 * 009 T6 — "Indicações recebidas" (componente reusável, extraído de /app/indicacoes).
 * Recebe os grupos JÁ buscados e gated pelo RSC (nunca busca/decide visibilidade aqui).
 * Reusado por: a zona gated do detalhe /app/dores/[id] (1 grupo) e a seção agregada da
 * vitrine /app/dores (N grupos). PII (nome/email) só chega aqui se o RSC autorizou (coord/admin).
 * Markup idêntico ao original (zero className fantasma).
 */
import type { Indicacao } from '@/lib/data/projetos'

export interface GrupoIndicacoes {
  projetoId: string
  /** rótulo "Título — Empresa" já composto pelo caller. */
  rotulo: string
  indicacoes: Indicacao[]
}

export interface IndicacoesRecebidasProps {
  grupos: GrupoIndicacoes[]
}

export function IndicacoesRecebidas({ grupos }: IndicacoesRecebidasProps) {
  return (
    <div className="ubm-indicacoes-projetos">
      {grupos.map((g) => {
        const inds = g.indicacoes.filter((ind) => !ind.deleted_at)
        return (
          <div key={g.projetoId} className="ubm-indicacoes-projeto">
            <div className="ubm-indicacoes-projeto-head">
              <span className="ubm-cota ubm-cota--muted">{g.rotulo}</span>
              <span className="ubm-indicacoes-projeto-contagem">
                {inds.length} {inds.length === 1 ? 'indicação' : 'indicações'}
              </span>
            </div>
            {inds.length === 0 ? (
              <div className="ubm-empty">
                <div className="ubm-empty-node" aria-hidden="true" />
                <p className="ubm-empty-msg">Nenhuma indicação ainda neste projeto.</p>
              </div>
            ) : (
              <ul className="ubm-indication-list" aria-label={`Indicações de ${g.rotulo}`}>
                {inds.map((ind) => (
                  <li key={ind.id} className="ubm-indication-row ubm-machined">
                    <span className="ubm-indication-avatar ubm-clip-node" aria-hidden="true">
                      {ind.papel_pretendido === 'coordenador' ? 'C' : 'A'}
                    </span>
                    <span className="ubm-indication-nome">
                      {ind.aluno_nome || ind.aluno_email || `Indicado (${ind.papel_pretendido})`}
                      {ind.curso ? <span className="ubm-indication-curso"> · {ind.curso}</span> : null}
                    </span>
                    <span className={`ubm-member-papel-chip ubm-member-papel-chip--${ind.papel_pretendido}`}>
                      {ind.papel_pretendido === 'coordenador' ? 'COORDENADOR' : 'ALUNO'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
