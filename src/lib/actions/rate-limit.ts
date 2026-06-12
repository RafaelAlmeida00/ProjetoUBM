/**
 * T-AN11 — Rate-limit por IP+janela na borda (Server Action).
 * SR-A3 [DURO]: ≤5 submissões/10min e ≤20 submissões/24h por IP.
 * IP só é confiável na borda (não no banco — E.5 da architecture).
 *
 * Store em memória: adequado ao free-tier (processo único). Se o processo reiniciar,
 * o estado é zerado — comportamento aceitável (objetivo é conter flood, não auditoria).
 * Para multi-instância: substituir pelo KV/edge sem mudar a interface.
 */

export type RateLimitResult =
  | { ok: true }
  | { ok: false; error: string }

/** Tetos de calibração (SR-A3) — não expostos na mensagem de recusa. */
const TETO_10MIN = 5
const TETO_24H = 20
const JANELA_10MIN_MS = 10 * 60 * 1_000
const JANELA_24H_MS = 24 * 60 * 60 * 1_000

/** Mensagem neutra PT-BR — não revela o teto exato (SR-A3). */
const MSG_RECUSA =
  'Muitas solicitações em pouco tempo. Por favor, aguarde alguns minutos e tente novamente.'

/**
 * Store de timestamps por CHAVE (em memória). A chave é um balde:
 * `ip:<ip>` para o teto por IP e `email:<email-normalizado>` para o teto por e-mail.
 * Manter o prefixo evita colisão entre um IP e um e-mail textualmente iguais.
 */
const _store: Map<string, number[]> = new Map()

/**
 * Extrai o IP do cliente de forma NÃO-spoofável (T-AN11b / SR-A3 [DURO]).
 *
 * O `x-forwarded-for` é uma lista `cliente, proxy1, proxy2, ...`: o hop **leftmost** é
 * fornecido pelo CLIENTE (forjável → rotação anula o rate-limit). O hop **rightmost** é
 * apendado pelo proxy confiável mais próximo, então é o mais difícil de forjar. Por isso:
 *   1. preferir o header setado pela plataforma (`x-vercel-forwarded-for`), quando presente;
 *   2. senão, usar o hop MAIS À DIREITA do `x-forwarded-for` (nunca o leftmost);
 *   3. senão, `x-real-ip`;
 *   4. senão, `'unknown'` — balde único conservador (todos sem IP confiável compartilham teto).
 */
export function extrairIpConfiavel(
  getHeader: (name: string) => string | null | undefined,
): string {
  const plataforma = getHeader('x-vercel-forwarded-for')?.trim()
  if (plataforma) return plataforma

  const xff = getHeader('x-forwarded-for')
  if (xff) {
    const hops = xff
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]! // rightmost, não leftmost
  }

  const real = getHeader('x-real-ip')?.trim()
  if (real) return real

  return 'unknown'
}

/** Normaliza o e-mail para a chave de balde (lower + trim) — mesmo titular = mesmo balde. */
function chaveEmail(email: string): string {
  return `email:${email.trim().toLowerCase()}`
}

/**
 * Referência mutável ao relógio — substituível nos testes sem vi.mock do módulo inteiro.
 * Em produção aponta para Date.now; em testes pode ser trocado via _clock.now = vi.fn().
 */
export const _clock = {
  now: (): number => Date.now(),
}

/** Remove timestamps expirados da janela informada e retorna os restantes. */
function filtrarJanela(timestamps: number[], janelaMs: number): number[] {
  const corte = _clock.now() - janelaMs
  return timestamps.filter((t) => t > corte)
}

/** Verifica uma única chave (balde) contra os dois tetos. */
function chaveExcedida(chave: string): boolean {
  const todos = _store.get(chave) ?? []
  if (filtrarJanela(todos, JANELA_10MIN_MS).length >= TETO_10MIN) return true
  if (filtrarJanela(todos, JANELA_24H_MS).length >= TETO_24H) return true
  return false
}

/**
 * Verifica se o cliente excedeu algum dos dois tetos, em QUALQUER um dos baldes
 * (IP e — quando informado — e-mail normalizado). Recusa se um deles estourar:
 * rotação de IP não escapa do teto por e-mail (T-AN11b / SR-A3 [DURO]).
 * NÃO registra a submissão — chamar registrarSubmissao após decisão de avançar.
 */
export function checarRateLimit(ip: string, email?: string): RateLimitResult {
  const chaves = [`ip:${ip}`]
  if (email && email.trim()) chaves.push(chaveEmail(email))

  for (const chave of chaves) {
    if (chaveExcedida(chave)) return { ok: false, error: MSG_RECUSA }
  }
  return { ok: true }
}

/** Apende `agora` ao balde da chave, podando o que saiu da janela de 24h. */
function registrarChave(chave: string, agora: number): void {
  const anteriores = _store.get(chave) ?? []
  const recentes = filtrarJanela(anteriores, JANELA_24H_MS)
  _store.set(chave, [...recentes, agora])
}

/**
 * Registra uma submissão bem-sucedida no balde do IP e — quando informado — no balde
 * do e-mail normalizado. Chamar SOMENTE após checarRateLimit retornar { ok: true } e a
 * RPC ter sido chamada.
 */
export function registrarSubmissao(ip: string, email?: string): void {
  const agora = _clock.now()
  registrarChave(`ip:${ip}`, agora)
  if (email && email.trim()) registrarChave(chaveEmail(email), agora)
}

/**
 * Limpa o store completo.
 * Usado apenas nos testes para isolar estados entre casos.
 */
export function limparStore(): void {
  _store.clear()
}
