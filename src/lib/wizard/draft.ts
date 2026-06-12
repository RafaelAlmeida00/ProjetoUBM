import type { NewProposal } from '../proposal'

// Rascunho do wizard em localStorage (AC3). Resiliente a ambiente sem storage (R3 / SSR).
const KEY = 'ubm.proposal.draft.v1'

function storage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null
  } catch {
    return null
  }
}

export function saveDraft(data: Partial<NewProposal>): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(KEY, JSON.stringify({ v: 1, data }))
  } catch {
    /* storage cheio/indisponível — degrada sem quebrar (R3) */
  }
}

export function loadDraft(): Partial<NewProposal> | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: number; data?: Partial<NewProposal> }
    return parsed?.data ?? null
  } catch {
    return null
  }
}

export function clearDraft(): void {
  const s = storage()
  if (!s) return
  try {
    s.removeItem(KEY)
  } catch {
    /* noop */
  }
}
