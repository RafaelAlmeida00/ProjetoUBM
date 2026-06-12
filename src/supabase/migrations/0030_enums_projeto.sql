-- Migração 0030 — enums de projeto + tabela projeto + trigger _dor_abre_projeto (feature 005)
-- architecture.md §3.1/§3.2/§5; tasks.md T-O1.1; security.md RS1, RS14.
-- Depende de: 0015 (dor, status_dor), 0016 (dor_curso), 0004 (helpers is_admin), 0008 (audit).
-- §9.1 honrado: trigger fail-soft; uq_projeto_dor + if not exists para idempotência (RN1/CA1).

-- ── Enums novos (3 tipos — ciclo de projeto) ────────────────────────────────
create type public.status_projeto as enum (
  'em_analise',
  'aprovado',
  'aguardando_proposta',
  'proposta_em_analise',
  'proposta_aprovada',
  'em_execucao',
  'finalizado'
  -- 'arquivado' NAO existe: é deleted_at ortogonal (RN20/CA19)
);

create type public.papel_pretendido as enum (
  'aluno',
  'coordenador'
);

create type public.papel_projeto as enum (
  'host',
  'co_coordenador',
  'aluno'
);

-- ── Tabela projeto (E14) ─────────────────────────────────────────────────────
-- 1:1 com a dor publicada; multicurso por join com dor_curso (RN1/RN2).
create table public.projeto (
  id                  uuid        primary key default gen_random_uuid(),
  dor_id              uuid        not null references public.dor(id) on delete cascade,
  status              public.status_projeto not null default 'em_analise',
  host_coordenador_id uuid        references auth.users(id),  -- NULL em em_analise; obrigatório após aprovação
  aprovado_em         timestamptz,                             -- preenchido no fechamento de equipe
  created_at          timestamptz not null default now(),
  created_by          uuid        references auth.users(id),   -- sistema (trigger) ou admin em override
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,                             -- "arquivado" = soft-delete ortogonal (RN20)
  deleted_by          uuid        references auth.users(id),

  -- CHECK: host obrigatório após aprovação (ADR-0009 / architecture §3.2)
  constraint host_exigido_apos_aprovacao
    check (status = 'em_analise' or host_coordenador_id is not null)
);

-- 1:1 com a dor (UNIQUE parcial — só linhas ativas) — RN1/CA1
create unique index uq_projeto_dor
  on public.projeto (dor_id)
  where deleted_at is null;

-- Índices de policy e de fila do admin
create index ix_projeto_status     on public.projeto (status);
create index ix_projeto_dor_id     on public.projeto (dor_id);
create index ix_projeto_host       on public.projeto (host_coordenador_id) where host_coordenador_id is not null;
-- Fila do admin: projetos em_analise não deletados
create index ix_projeto_fila_admin on public.projeto (status) where status = 'em_analise' and deleted_at is null;

-- ── RLS enable+force (deny-by-default — RS1 / anti CVE-2025-48757) ──────────
alter table public.projeto enable row level security;
alter table public.projeto force  row level security;

-- SELECT: vitrine pública — qualquer um vê projetos ativos (RN23)
create policy projeto_select_publica on public.projeto
  for select to anon, authenticated
  using (deleted_at is null);

-- SELECT: admin vê tudo (inclusive soft-deletados)
create policy projeto_select_admin on public.projeto
  for select to authenticated
  using ((select public.is_admin()));

-- INSERT: NENHUMA policy — só o trigger _dor_abre_projeto (SECURITY DEFINER) insere
-- UPDATE e DELETE policies virão na 0031 (guarda de transição) e 0035 (RPCs)
-- Nota: DELETE policy básica para admin (soft-delete) — RN20
create policy projeto_delete_admin on public.projeto
  for delete to authenticated
  using ((select public.is_admin()));

-- ── Auditoria (trigger zzz_audit — padrão herdado) ──────────────────────────
create trigger zzz_audit after insert or update or delete on public.projeto
  for each row execute function audit.gravar_versao();

-- ── Trigger _dor_abre_projeto: dor publicada → abre projeto (§5) ─────────────
-- AFTER UPDATE OF status_dor ON public.dor
-- SECURITY DEFINER: roda como dono, não como caller
-- Idempotente: se not exists → não abre 2º projeto (RN1/RS14)
-- Fail-soft: erro interno não regride a publicação (RS14)
create or replace function public._dor_abre_projeto()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Só age quando status_dor transita para 'publicada' (nova publicação)
  if new.status_dor = 'publicada'
     and (old is null or old.status_dor <> 'publicada')
  then
    -- Idempotência: só abre projeto se não existe ainda (uq_projeto_dor garante unicidade)
    if not exists (
      select 1 from public.projeto
      where dor_id = new.id and deleted_at is null
    ) then
      insert into public.projeto (dor_id, status, created_by)
      values (new.id, 'em_analise', new.aprovado_por);
      -- O INSERT em projeto dispara _projeto_abre_evento (definido na 0031)
      -- que grava status_evento NULL→em_analise com autor_id = NULL (sistema)
    end if;
  end if;
  return new;
exception when others then
  -- Fail-soft: qualquer falha interna é silenciada — publicação da dor NÃO é impedida (RS14)
  return new;
end; $$;

create trigger dor_abre_projeto
  after update of status_dor on public.dor
  for each row execute function public._dor_abre_projeto();

-- ── Grants (hardening vem na 0038) ──────────────────────────────────────────
-- Trigger fn sem grant (chamada pelo runtime do Postgres, não pelo caller)
-- Nenhum grant de execute aqui: a 0038 faz revoke+grant final em tudo

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — na ordem inversa)                                     ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop trigger if exists dor_abre_projeto on public.dor;
-- drop function if exists public._dor_abre_projeto();
-- drop trigger if exists zzz_audit on public.projeto;
-- drop table if exists public.projeto;
-- drop type if exists public.papel_projeto;
-- drop type if exists public.papel_pretendido;
-- drop type if exists public.status_projeto;
-- ╚══════════════════════════════════════════════════════════════════════════╝
