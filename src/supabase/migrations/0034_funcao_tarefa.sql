-- Migração 0034 — funcao_tarefa (E16) + policies por papel (feature 005)
-- architecture.md §3.5; tasks.md T-O1.5; security.md RS1, RS8.
-- RN21, RN22, RN26 · CA20, CA21, CA22.
-- Depende de: 0030 (projeto), 0031 (is_team_member/is_project_coordinator), 0004 (is_admin), 0008 (audit).
--
-- Mutação por DML DIRETO sob RLS (não via RPC): a RLS é a barreira (RS8).
--   - aluno (membro) gerencia as PRÓPRIAS (responsavel_id = auth.uid())
--   - host / co_coordenador (is_project_coordinator) gerenciam as de TODOS
--   - admin é override; não-membro/anon: negado (RN26 — privado ao projeto)
--   - SEM trava de estado (C3): organização contínua enquanto não soft-deletado

-- ── Tabela funcao_tarefa (E16) ───────────────────────────────────────────────
create table public.funcao_tarefa (
  id             uuid        primary key default gen_random_uuid(),
  projeto_id     uuid        not null references public.projeto(id) on delete cascade,
  responsavel_id uuid        not null references auth.users(id),       -- membro responsável
  titulo         text        not null check (length(btrim(titulo)) > 0),
  descricao      text,
  concluida      boolean     not null default false,
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users(id),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  deleted_by     uuid        references auth.users(id)
);

create index ix_funcao_tarefa_projeto     on public.funcao_tarefa (projeto_id);
create index ix_funcao_tarefa_responsavel on public.funcao_tarefa (responsavel_id);

-- ── RLS enable+force (deny-by-default — RS1) ────────────────────────────────
alter table public.funcao_tarefa enable row level security;
alter table public.funcao_tarefa force  row level security;

-- SELECT: membros da equipe + admin (RN26 — privado ao projeto; NÃO público)
create policy funcao_tarefa_select on public.funcao_tarefa
  for select to authenticated
  using (
    deleted_at is null
    and ((select public.is_team_member(projeto_id)) or (select public.is_admin()))
  );

-- INSERT: coordenação cria p/ qualquer membro; aluno cria as PRÓPRIAS (membro + responsavel=self); admin
create policy funcao_tarefa_insert on public.funcao_tarefa
  for insert to authenticated
  with check (
    (select public.is_project_coordinator(projeto_id))
    or (responsavel_id = (select auth.uid()) and (select public.is_team_member(projeto_id)))
    or (select public.is_admin())
  );

-- UPDATE: coordenação todas; aluno as próprias (responsavel=self); admin
create policy funcao_tarefa_update on public.funcao_tarefa
  for update to authenticated
  using (
    deleted_at is null
    and (
      (select public.is_project_coordinator(projeto_id))
      or (responsavel_id = (select auth.uid()))
      or (select public.is_admin())
    )
  )
  with check (
    (select public.is_project_coordinator(projeto_id))
    or (responsavel_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- DELETE: coordenação/admin; aluno as próprias (o "arquivar" no app é soft-delete = UPDATE)
create policy funcao_tarefa_delete on public.funcao_tarefa
  for delete to authenticated
  using (
    (select public.is_project_coordinator(projeto_id))
    or (responsavel_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- ── Auditoria (trigger zzz_audit — padrão herdado 0008) ─────────────────────
create trigger zzz_audit after insert or update or delete on public.funcao_tarefa
  for each row execute function audit.gravar_versao();

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — na ordem inversa)                                       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop trigger if exists zzz_audit on public.funcao_tarefa;
-- drop table if exists public.funcao_tarefa;
-- ╚══════════════════════════════════════════════════════════════════════════╝
