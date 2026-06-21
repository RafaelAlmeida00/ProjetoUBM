/**
 * 009 T16 (RN14/CA7) — deep-link de notificação consolidado em /app/dores.
 *
 * Após a consolidação, NENHUM deep-link aponta para rota morta (/app/projetos*, /app/indicacoes).
 * Os tipos que antes levavam ao detalhe do projeto resolvem `projeto_id → dor_id` (lookup em lote
 * feito no RSC; aqui recebemos o mapa pronto) e navegam para /app/dores/<dor_id>. Quando o
 * projeto não resolve (soft-deleted/sem-acesso/sem mapa) o fallback é a vitrine /app/dores.
 *
 * Função PURA e testável (sem Supabase) — a página e o teste importam a mesma implementação,
 * eliminando a duplicação que existia (reimplementação inline em notificacoes-005.test).
 */
export type PayloadNotif = Record<string, string> | null

/**
 * @param tipo            coluna `notificacao.tipo`
 * @param payload         `notificacao.payload` (pode trazer `evento` e `projeto_id`)
 * @param projetoParaDor  mapa projeto_id → dor_id resolvido no RSC (em lote)
 */
export function resolverDeepLink(
  tipo: string,
  payload: PayloadNotif,
  projetoParaDor: Map<string, string>,
): string {
  const evento = payload?.evento ?? tipo
  const projetoId = payload?.projeto_id
  const dorAlvo = projetoId ? projetoParaDor.get(projetoId) : undefined

  // Tipos ligados a um projeto específico → detalhe da dor (gestão/andamento vivem lá).
  // status_mudou (base 002) também carrega projeto_id no payload.
  if (
    evento === 'equipe_fechada' ||
    evento === 'eleito_host' ||
    evento === 'projeto_avancou' ||
    tipo === 'status_mudou'
  ) {
    return dorAlvo ? `/app/dores/${dorAlvo}` : '/app/dores'
  }

  // Abertura/aprovação por curso → vitrine (o aluno/coord se indica inline no card).
  if (evento === 'projeto_aberto' || tipo === 'dor_aprovada_curso') {
    return '/app/dores'
  }

  // Fallback genérico: vitrine (nunca rota morta).
  return '/app/dores'
}
