import type { SavedProposal } from '../proposal'
import type { CreateProposalInput, ProposalRepository } from './proposal-repository'

function newId(): string {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID()
    }
  } catch {
    /* fallback abaixo */
  }
  return 'id-' + Math.random().toString(36).slice(2, 12)
}

/** Adapter em memória para testes/dev sem chaves (ADR-0002/C1). */
export class InMemoryProposalRepository implements ProposalRepository {
  private rows: SavedProposal[] = []

  async create(input: CreateProposalInput): Promise<SavedProposal> {
    const row: SavedProposal = {
      ...input.proposal,
      id: newId(),
      userId: input.userId,
      email: input.email,
      consentAt: input.consentAt,
      createdAt: new Date().toISOString(),
    }
    this.rows.push(row)
    return row
  }

  async listByUser(userId: string): Promise<SavedProposal[]> {
    return this.rows.filter((r) => r.userId === userId)
  }
}
