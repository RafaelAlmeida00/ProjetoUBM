/**
 * Validação de e-mail corporativo — T-B15 / spec ux-ui §6.
 * Regra de borda no FE; não substitui validação server-side.
 * Domínios comparados case-insensitive.
 */

export const DOMINIOS_GRATUITOS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'yahoo.com', 'yahoo.com.br', 'icloud.com', 'bol.com.br', 'uol.com.br',
  'terra.com.br', 'globo.com', 'protonmail.com', 'proton.me',
])

/**
 * Valida o e-mail corporativo:
 * - null  = sem erro (campo vazio: ainda não validar)
 * - string = mensagem de erro contextual
 */
export function validarEmailCorporativo(email: string): string | null {
  if (!email) return null
  const atIdx = email.indexOf('@')
  if (atIdx < 1 || atIdx === email.length - 1) {
    return 'Confira o e-mail: parece faltar o "@" ou o domínio.'
  }
  const dominio = email.slice(atIdx + 1).toLowerCase()
  if (DOMINIOS_GRATUITOS.has(dominio)) {
    return 'Use um e-mail do domínio da sua empresa (ex.: nome@suaempresa.com.br). Endereços gratuitos como @gmail.com não identificam a empresa para o nosso contato.'
  }
  return null
}

/**
 * Retorna true se o e-mail for válido e pertencer a um domínio corporativo.
 * Usado para habilitar/desabilitar o botão "Concluir" no onboarding.
 */
export function isEmailCorporativo(email: string): boolean {
  return !!email && email.includes('@') && validarEmailCorporativo(email) === null
}
