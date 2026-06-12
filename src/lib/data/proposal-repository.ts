import type { NewProposal, SavedProposal } from '../proposal'

/** Entrada de criação: dados do wizard + campos derivados no SERVIDOR (RN2/RS3). */
export interface CreateProposalInput {
  proposal: NewProposal
  userId: string // do auth (server) — nunca do payload do cliente (T-02)
  email: string // do OAuth (server) — RN2/AC5
  consentAt: string // ISO8601
}

/** Porta de persistência (ADR-0002). Adapters: InMemory (test/dev) e Supabase (deploy, T4d). */
export interface ProposalRepository {
  create(input: CreateProposalInput): Promise<SavedProposal>
  listByUser(userId: string): Promise<SavedProposal[]>
}
