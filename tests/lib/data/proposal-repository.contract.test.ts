import { proposalRepositoryContract } from '../../_contracts/proposal-repository.contract'
import { InMemoryProposalRepository } from '@/lib/data/in-memory-proposal-repository'

// T1e — roda o contrato contra o adapter em memória.
proposalRepositoryContract(() => new InMemoryProposalRepository())
