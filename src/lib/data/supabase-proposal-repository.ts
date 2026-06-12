import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from '../supabase/env'
import type { CursoUbm } from '../courses'
import type { SavedProposal } from '../proposal'
import type { CreateProposalInput, ProposalRepository } from './proposal-repository'

// Adapter Supabase (ADR-0002). ESCREVE com anon key + sessão do usuário sob RLS.
// NUNCA usa a chave de serviço (RS8/I-03) — só a chave pública. Ligação real é passo de deploy.

interface ProposalRow {
  id: string
  user_id: string
  email: string
  rep_nome: string
  empresa: string
  departamento: string | null
  cargo: string | null
  dor: string
  cursos: CursoUbm[]
  consent: boolean
  consent_version: string
  consent_at: string
  created_at: string
}

function client(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env ausente')
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

function toSaved(row: ProposalRow): SavedProposal {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    repNome: row.rep_nome,
    empresa: row.empresa,
    departamento: row.departamento ?? undefined,
    cargo: row.cargo ?? undefined,
    dor: row.dor,
    cursos: row.cursos,
    consent: row.consent,
    consentVersion: row.consent_version,
    consentAt: row.consent_at,
    createdAt: row.created_at,
  }
}

export class SupabaseProposalRepository implements ProposalRepository {
  async create(input: CreateProposalInput): Promise<SavedProposal> {
    const p = input.proposal
    const { data, error } = await client()
      .from('proposal')
      .insert({
        user_id: input.userId, // RLS WITH CHECK garante = auth.uid()
        email: input.email,
        rep_nome: p.repNome,
        empresa: p.empresa,
        departamento: p.departamento ?? null,
        cargo: p.cargo ?? null,
        dor: p.dor,
        cursos: p.cursos,
        consent: p.consent,
        consent_version: p.consentVersion,
        consent_at: input.consentAt,
      })
      .select()
      .single()
    if (error) throw error
    return toSaved(data as ProposalRow)
  }

  async listByUser(userId: string): Promise<SavedProposal[]> {
    // RLS já restringe ao dono; o filtro é defesa em profundidade.
    const { data, error } = await client().from('proposal').select('*').eq('user_id', userId)
    if (error) throw error
    return (data as ProposalRow[]).map(toSaved)
  }
}
