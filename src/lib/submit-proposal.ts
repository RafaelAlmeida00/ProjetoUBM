import { validateNewProposal, type NewProposal, type SavedProposal } from './proposal'
import { getGateways, type Gateways } from './factory'

export type SubmitErrorCode = 'no_session' | 'no_consent' | 'invalid'

export class SubmitError extends Error {
  code: SubmitErrorCode
  constructor(code: SubmitErrorCode, message: string) {
    super(message)
    this.name = 'SubmitError'
    this.code = code
  }
}

/**
 * Validação e gravação da proposta NO SERVIDOR (AC4/AC5/AC6/AC8; RS1/RS3/RS4/RS5).
 * `gateways` é injetável para teste; em produção usa a factory (mock sem env; Supabase com env).
 * A action real do form ('use server') deve ser um wrapper fino que chama esta função.
 */
export async function submitProposal(
  input: NewProposal,
  gateways: Gateways = getGateways(),
): Promise<SavedProposal> {
  // 1. Sessão obrigatória (fail-closed) — RS1/AC4
  const user = await gateways.auth.getCurrentUser()
  if (!user) throw new SubmitError('no_session', 'É preciso estar autenticado para enviar.')

  // 2. Consentimento obrigatório, validado no servidor — RS4/AC8
  if (input.consent !== true) throw new SubmitError('no_consent', 'Consentimento é obrigatório.')

  // 3. Validação de domínio (allowlist/limites/obrigatórios) — RS5
  if (validateNewProposal(input).length > 0) {
    throw new SubmitError('invalid', 'Não foi possível enviar: revise os campos.')
  }

  // 4. E-mail e dono vêm do SERVIDOR (ignora qualquer e-mail do cliente) — RS3/AC5
  return gateways.proposals.create({
    proposal: input,
    userId: user.id,
    email: user.email,
    consentAt: new Date().toISOString(),
  })
}
