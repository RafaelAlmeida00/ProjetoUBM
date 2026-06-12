// Configuração de runtime. Política de privacidade = link EXTERNO (cliente fornece a URL — spec §11b/R7).
export const PRIVACY_POLICY_URL =
  process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL ?? 'https://www.ubm.br/politica-de-privacidade'
