/**
 * 009 T2 — /app/indicacoes → redirect /app/dores.
 * A consolidação (009) realocou as features desta rota:
 *  - indicar-se → cards da vitrine /app/dores (já existia) + ação contextual no detalhe.
 *  - "Indicações recebidas" → seção agregada gated na vitrine (T18) e zona gated do detalhe /app/dores/[id] (T9).
 * Arquivo preservado como stub (template /casos; ADR-0002 §consequências — remoção física só após 1 ciclo sem tráfego).
 */
import { redirect } from 'next/navigation'

export default function IndicacoesPage() {
  redirect('/app/dores')
}
