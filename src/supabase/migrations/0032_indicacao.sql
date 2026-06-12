-- Migração 0032 — tabela indicacao (E13) + RPCs indicar_se / retirar_indicacao (feature 005)
-- architecture.md §3.3; tasks.md T-O1.3; security.md RS1, RS3.
-- RN4, RN5, RN6, RN7, RN8, RN9 · CA3, CA4, CA5, CA6, CA7, CA8.
-- Depende de: 0030 (projeto, papel_pretendido), 0004 (esta_verificado), 0008 (audit.gravar_versao).
--
-- Auto-indicação aberta e privada:
--   - pessoa_id = auth.uid() imposto pela RPC (RS3 — não indicar terceiros)
--   - gate esta_verificado() (RN8) + projeto em em_analise (RN9)
--   - UNIQUE parcial → 1 indicação ATIVA por pessoa por projeto (RN7/CA6); retirar = soft-delete
--   - sem limite de quantidade (RN6); coordenador de QUALQUER curso pode (RN5)
--   - INSERT/UPDATE/DELETE diretos negados (deny-by-default) → só via RPC SECURITY DEFINER

-- ── Tabela indicacao (E13) ───────────────────────────────────────────────────
create table public.indicacao (
  id               uuid        primary key default gen_random_uuid(),
  projeto_id       uuid        not null references public.projeto(id) on delete cascade,
  pessoa_id        uuid        not null references auth.users(id) on delete cascade,  -- quem se indicou
  papel_pretendido public.papel_pretendido not null,                                 -- 'aluno' | 'coordenador'
  mensagem         text,                                                             -- opcional (PII livre — erasure §9.1.4a)
  created_at       timestamptz not null default now(),
  created_by       uuid        references auth.users(id),
  deleted_at       timestamptz,                                                      -- "retirar" = soft-delete (RN7)
  deleted_by       uuid        references auth.users(id)
);

-- Uma indicação ATIVA por pessoa por projeto (UNIQUE parcial) — RN7/CA6
create unique index uq_indicacao_pessoa_projeto
  on public.indicacao (projeto_id, pessoa_id)
  where deleted_at is null;

-- Índices de policy
create index ix_indicacao_projeto on public.indicacao (projeto_id);
create index ix_indicacao_pessoa  on public.indicacao (pessoa_id);

-- ── RLS enable+force (deny-by-default — RS1 / anti CVE-2025-48757) ──────────
alter table public.indicacao enable row level security;
alter table public.indicacao force  row level security;

-- SELECT: o próprio vê a sua indicação (necessário p/ UX "já indicado / retirar").
-- A visibilidade ampla (coordenador-do-curso-da-dor + admin) vem na 0036 (RN25/RS2).
-- anon e demais authenticated: sem policy → negado (deny-by-default).
create policy indicacao_select_propria on public.indicacao
  for select to authenticated
  using (pessoa_id = (select auth.uid()));

-- INSERT/UPDATE/DELETE diretos: NENHUMA policy → negado.
-- A mutação acontece SÓ via indicar_se / retirar_indicacao (SECURITY DEFINER) — RS3.

-- ── Auditoria (trigger zzz_audit — padrão herdado 0008) ─────────────────────
create trigger zzz_audit after insert or update or delete on public.indicacao
  for each row execute function audit.gravar_versao();

-- ── RPC indicar_se: auto-indicação (RN4/RN8/RN9/RS3) ─────────────────────────
create or replace function public.indicar_se(
  p_projeto_id        uuid,
  p_papel_pretendido  public.papel_pretendido,
  p_mensagem          text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  -- Gate de verificação (RN8/CA7)
  if not (select public.esta_verificado()) then
    raise exception 'conta nao verificada nao pode indicar-se (RN8/CA7)';
  end if;

  -- Janela de indicação: projeto deve estar em em_analise (RN9/CA8)
  if not exists (
    select 1 from public.projeto
    where id = p_projeto_id and status = 'em_analise' and deleted_at is null
  ) then
    raise exception 'projeto nao esta em em_analise — janela de indicacao fechada (RN9/CA8)';
  end if;

  -- Self-indicação: pessoa_id = auth.uid() (RS3).
  -- Sem limite (RN6); a uq parcial barra a 2ª ativa da mesma pessoa (RN7/CA6 → unique_violation).
  insert into public.indicacao (projeto_id, pessoa_id, papel_pretendido, mensagem, created_by)
  values (p_projeto_id, v_uid, p_papel_pretendido, p_mensagem, v_uid)
  returning id into v_id;

  return v_id;
end; $$;

-- ── RPC retirar_indicacao: soft-delete da própria (RN7) ──────────────────────
create or replace function public.retirar_indicacao(p_projeto_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  update public.indicacao
     set deleted_at = now(),
         deleted_by = v_uid
   where projeto_id = p_projeto_id
     and pessoa_id  = v_uid
     and deleted_at is null;
end; $$;

-- ── Grants provisórios (hardening final na 0038: revoke from public + re-grant) ──
grant execute on function public.indicar_se(uuid, public.papel_pretendido, text) to authenticated;
grant execute on function public.retirar_indicacao(uuid)                          to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — na ordem inversa)                                       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop function if exists public.retirar_indicacao(uuid);
-- drop function if exists public.indicar_se(uuid, public.papel_pretendido, text);
-- drop trigger if exists zzz_audit on public.indicacao;
-- drop table if exists public.indicacao;
-- ╚══════════════════════════════════════════════════════════════════════════╝
