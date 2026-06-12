-- Migração 0031 — tabela status_evento (append-only) + trigger _projeto_abre_evento
--              + trigger _projeto_guarda_transicao (guarda de transição — defesa definitiva)
-- architecture.md §3.6/§4.2/§9.1.3; tasks.md T-O1.2; security.md RS6, RS7.
-- §9.1.3 (empacotamento): status_evento + triggers ficam aqui (logo após 0030/projeto),
--   pois _dor_abre_projeto (0030) insere projeto → dispara _projeto_abre_evento aqui.
-- Depende de: 0030 (projeto, status_projeto), 0004 (is_admin), 0008 (audit).
--
-- PADRÃO APPEND-ONLY (RS7):
--   - SEM deleted_at, SEM zzz_audit (a tabela JÁ É a trilha de negócio)
--   - INSERT apenas via trigger SECURITY DEFINER — sem grant a authenticated/anon
--   - Sem policy de INSERT/UPDATE/DELETE → negado por deny-by-default

-- ── Tabela status_evento (E20) ───────────────────────────────────────────────
create table public.status_evento (
  id          uuid        primary key default gen_random_uuid(),
  projeto_id  uuid        not null references public.projeto(id) on delete cascade,
  de_status   public.status_projeto,                -- NULL na abertura (NULL→em_analise)
  para_status public.status_projeto not null,
  autor_id    uuid        references auth.users(id), -- NULL/sistema na abertura; auth.uid() nas demais
  motivo      text,                                  -- observação/motivo do override (PII livre — erasure §9.1.4a)
  ocorrido_em timestamptz not null default now()
  -- SEM deleted_at (append-only por estrutura — RN18/CA17)
  -- SEM updated_at (imutável)
);

-- Índice para ordenação da timeline
create index ix_status_evento_projeto_ts
  on public.status_evento (projeto_id, ocorrido_em);

-- ── RLS enable+force (deny-by-default — RS1 / anti CVE-2025-48757) ──────────
alter table public.status_evento enable row level security;
alter table public.status_evento force  row level security;

-- SELECT: público — qualquer um lê a timeline (RN23/CA23)
-- INSERT/UPDATE/DELETE: NENHUMA policy → negado (append-only — RS7/CA17)
create policy status_evento_select_publica on public.status_evento
  for select to anon, authenticated
  using (true);

-- Append-only enforcement extra: policy explícita com USING(false) para UPDATE/DELETE
-- garante que qualquer tentativa de UPDATE/DELETE lança erro (não apenas 0 rows silencioso).
-- Usar "USING (false)" é o padrão Postgres para criar deny explícito que gera exceção.
create policy status_evento_no_update on public.status_evento
  for update to anon, authenticated
  using (false);

create policy status_evento_no_delete on public.status_evento
  for delete to anon, authenticated
  using (false);

-- ── Trigger _projeto_abre_evento: INSERT projeto → grava NULL→em_analise ────
-- AFTER INSERT ON public.projeto
-- autor_id = NULL (sistema — §9.1.4c: nunca o caller)
create or replace function public._projeto_abre_evento()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.status_evento (projeto_id, de_status, para_status, autor_id, motivo)
  values (new.id, null, 'em_analise', null, null);
  -- autor_id é NULL/sistema: o evento de abertura não tem ator humano (§9.1.4c)
  return new;
exception when others then
  -- Fail-soft: não impede a criação do projeto se status_evento falhar
  return new;
end; $$;

create trigger projeto_abre_evento
  after insert on public.projeto
  for each row execute function public._projeto_abre_evento();

-- ── Helpers de escopo por-projeto ───────────────────────────────────────────
-- (arquitetura §4.2 — SECURITY DEFINER set search_path='', chamados como (select helper()))
-- is_project_host, is_project_coordinator e is_team_member são definidos aqui
-- porque a guarda abaixo os consome. membro_equipe vem na 0033 — mas os helpers
-- precisam existir agora (retornam false enquanto a tabela não existe).

-- Helpers de escopo: usam plpgsql para resolução lazy da tabela membro_equipe
-- (membro_equipe é criada na 0033; plpgsql compila o corpo na chamada, não na criação)
create or replace function public.is_project_host(p_projeto_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1 from public.membro_equipe me
    where me.projeto_id = p_projeto_id
      and me.pessoa_id  = (select auth.uid())
      and me.papel_projeto = 'host'
      and me.deleted_at is null
  );
exception when undefined_table then
  return false;
end; $$;

create or replace function public.is_project_coordinator(p_projeto_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1 from public.membro_equipe me
    where me.projeto_id = p_projeto_id
      and me.pessoa_id  = (select auth.uid())
      and me.papel_projeto in ('host', 'co_coordenador')
      and me.deleted_at is null
  );
exception when undefined_table then
  return false;
end; $$;

create or replace function public.is_team_member(p_projeto_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1 from public.membro_equipe me
    where me.projeto_id = p_projeto_id
      and me.pessoa_id  = (select auth.uid())
      and me.deleted_at is null
  );
exception when undefined_table then
  return false;
end; $$;

-- is_dor_course_coordinator: coordenador de algum curso da dor do projeto
-- PONTE OBRIGATÓRIA via public.curso (§9.1.1 / RS10):
--   projeto → dor → dor_curso (slug) → curso (slug↔id) → coordenador_curso (uuid)
create or replace function public.is_dor_course_coordinator(p_projeto_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.projeto       pj
    join public.dor_curso     dc on dc.dor_id    = pj.dor_id
    join public.curso         c  on c.slug       = dc.curso
    join public.coordenador_curso cc on cc.curso_id = c.id
    where pj.id         = p_projeto_id
      and cc.user_id    = (select auth.uid())
  );
$$ ;

-- Grants provisórios (hardening final na 0038 — revoke+re-grant de tudo)
grant execute on function public.is_project_host(uuid)          to anon, authenticated;
grant execute on function public.is_project_coordinator(uuid)   to anon, authenticated;
grant execute on function public.is_team_member(uuid)           to anon, authenticated;
grant execute on function public.is_dor_course_coordinator(uuid) to anon, authenticated;

-- ── Policies UPDATE de projeto (primeira linha da guarda — §4.2) ────────────
-- Adicionadas aqui junto ao trigger-guarda (que as pressupõe) para que o BEFORE UPDATE
-- possa disparar. A policy de host (projeto_update_host) vem na 0035 junto às RPCs.
-- sem estas policies o UPDATE é silenciosamente negado por RLS e o trigger nunca dispara.

-- Admin: pode fazer qualquer UPDATE (override RN19) — using/with check sem restrição de estado
create policy projeto_update_admin on public.projeto
  for update to authenticated
  using     ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ── Trigger _projeto_guarda_transicao: guarda de transição (BEFORE UPDATE) ──
-- Defesa definitiva (architecture §4.2 / ADR-005A):
--   - Se status não mudou: deixa passar (UPDATE de conteúdo)
--   - Tabula (de, para, papel) — matriz da spec RN15/RN16/RN17/RN19
--   - Pares da 006: raise para não-admin; admin pode override (RN19)
--   - Em toda transição aceita: INSERT status_evento (de, para, autor, motivo)
--
-- RLS de UPDATE de projeto (primeira linha) vem na 0035.
-- Aqui a guarda BEFORE UPDATE é a defesa definitiva independente de RLS.
create or replace function public._projeto_guarda_transicao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_de   text := old.status::text;
  v_para text := new.status::text;
  v_uid  uuid := (select auth.uid());
begin
  -- Se o status não mudou: UPDATE de conteúdo — deixa passar
  if v_de = v_para then return new; end if;

  -- Matriz de transições (de, para) × papel:
  case
    when v_de = 'em_analise' and v_para = 'aprovado' then
      -- Só admin (caminho normal = fechar_equipe / RN10/CA9)
      if not (select public.is_admin()) then
        raise exception 'transicao em_analise->aprovado exige admin (RN10/CA9)';
      end if;

    when v_de = 'aprovado' and v_para = 'aguardando_proposta' then
      -- Só host (via avancar_projeto / RN17/CA14) — ou admin override (RN19)
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'transicao aprovado->aguardando_proposta exige host do projeto (RN17/CA14)';
      end if;

    -- ── Pares da 006 (definidos no enum/guarda, não disparáveis na 005 — C1) ──
    when v_de = 'aguardando_proposta' and v_para = 'proposta_em_analise' then
      if not (select public.is_admin()) then
        raise exception 'transicao pertence a feature 006 (nao disparavel na 005/C1)';
      end if;
    when v_de = 'proposta_em_analise' and v_para = 'proposta_aprovada' then
      if not (select public.is_admin()) then
        raise exception 'transicao pertence a feature 006 (nao disparavel na 005/C1)';
      end if;
    when v_de = 'proposta_em_analise' and v_para = 'aguardando_proposta' then
      if not (select public.is_admin()) then
        raise exception 'transicao pertence a feature 006 (nao disparavel na 005/C1)';
      end if;
    when v_de = 'proposta_aprovada' and v_para = 'em_execucao' then
      if not (select public.is_admin()) then
        raise exception 'transicao pertence a feature 006 (nao disparavel na 005/C1)';
      end if;
    when v_de = 'em_execucao' and v_para = 'finalizado' then
      if not (select public.is_admin()) then
        raise exception 'transicao pertence a feature 006 (nao disparavel na 005/C1)';
      end if;

    else
      -- Qualquer outro par: admin pode (override RN19), demais negados
      if not (select public.is_admin()) then
        raise exception 'transicao de estado invalida: % -> % (RN16)', v_de, v_para;
      end if;
  end case;

  -- Em toda transição aceita: grava status_evento (timeline append-only — RN18).
  -- O motivo vem de uma GUC de sessão (app.transicao_motivo) setada por override_transicao (0035);
  -- transições normais (avancar_projeto / fechar_equipe) não setam a GUC → motivo NULL.
  insert into public.status_evento (projeto_id, de_status, para_status, autor_id, motivo)
  values (new.id, old.status, new.status, v_uid,
          nullif(current_setting('app.transicao_motivo', true), ''));

  return new;
end; $$;

create trigger projeto_guarda_transicao
  before update on public.projeto
  for each row execute function public._projeto_guarda_transicao();

-- ── Grants (trigger fns — sem grant a app roles; hardening final na 0038) ────
-- _projeto_abre_evento, _projeto_guarda_transicao: trigger fns, nenhum grant

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — na ordem inversa)                                     ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop trigger if exists projeto_guarda_transicao on public.projeto;
-- drop function if exists public._projeto_guarda_transicao();
-- drop trigger if exists projeto_abre_evento on public.projeto;
-- drop function if exists public._projeto_abre_evento();
-- drop function if exists public.is_dor_course_coordinator(uuid);
-- drop function if exists public.is_team_member(uuid);
-- drop function if exists public.is_project_coordinator(uuid);
-- drop function if exists public.is_project_host(uuid);
-- drop trigger if exists zzz_audit on public.status_evento; -- n/a
-- drop table if exists public.status_evento;
-- ╚══════════════════════════════════════════════════════════════════════════╝
