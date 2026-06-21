-- 0067 — Tabela contraproposta (E19) + RLS espelhando o documento
--
-- Registra a inversão de fluxo feita pelo representante com motivo obrigatório (RN14/CA11).
-- O motivo é sensível (sigilo de negociação — RN19/CA19): segue a MESMA visibilidade do
-- documento (host/coord/rep/admin). Aluno NÃO vê; anon NUNCA vê (RS1).
-- INSERT: só via RPC SECURITY DEFINER (nenhuma policy de escrita a authenticated).
-- Soft-delete: deleted_at/deleted_by (reversibilidade).
--
-- Depende de: 0065 (documento_proposta), 0030 (projeto)
--
-- Rollback:
--   drop table if exists public.contraproposta;

create table public.contraproposta (
  id           uuid        primary key default gen_random_uuid(),
  projeto_id   uuid        not null references public.projeto(id) on delete cascade,
  -- documento de origem (a proposta que gerou a contraproposta)
  documento_id uuid        not null references public.documento_proposta(id) on delete restrict,
  -- motivo obrigatório, não vazio após trim (RN14/CA11)
  motivo       text        not null check (length(btrim(motivo)) > 0),
  -- o representante que fez a contraproposta
  criado_por   uuid        not null references auth.users(id),
  created_at   timestamptz not null default now(),
  -- soft-delete
  deleted_at   timestamptz,
  deleted_by   uuid        references auth.users(id)
);

-- RLS: enable + force (deny-by-default — RS1)
alter table public.contraproposta enable  row level security;
alter table public.contraproposta force   row level security;

-- ── SELECT: visibilidade do documento (motivo é sensível — RN19/CA19 — RS2) ─────
-- Vê: admin OU representante da empresa OU coordenação do projeto (host+co-coord).
-- Aluno NÃO vê; anon NUNCA vê; sem policy anon => negado (RS1).
-- INSERT: apenas via RPC SECURITY DEFINER (sem policy de escrita — RS5).
create policy contraproposta_select_restrita
  on public.contraproposta
  for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.documento_proposta dp
      where dp.id = contraproposta.documento_id
        and dp.deleted_at is null
        and (
          (select public.is_admin())
          or (select public.is_company_rep(dp.empresa_id))
          or (select public.is_project_coordinator(dp.projeto_id))
        )
    )
  );

-- SEM policy anon          => negado (RS1).
-- SEM policy INSERT/UPDATE => authenticated não escreve diretamente (RS5).
