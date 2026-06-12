-- Migração 0033 — tabela membro_equipe (E15) + RPC atômica fechar_equipe (feature 005)
-- architecture.md §3.4/§4.3; tasks.md T-O1.4; security.md RS1, RS4, RS5, RS10.
-- RN10, RN11, RN12, RN13 · CA9, CA10, CA11, CA12.
-- Depende de: 0030 (projeto, papel_projeto), 0031 (helpers de escopo + guarda de transição), 0032 (indicacao), 0004 (is_admin), 0008 (audit).
--
-- Nota: os helpers is_project_host/is_project_coordinator/is_team_member/is_dor_course_coordinator
--   JÁ foram definidos na 0031 (a guarda de transição os consome). Aqui NÃO os redefinimos.
-- fechar_equipe é SECURITY DEFINER (dono superuser → bypassa RLS p/ inserir membros e
--   aprovar o projeto); a guarda BEFORE UPDATE (0031) ainda dispara e grava status_evento.

-- ── Tabela membro_equipe (E15) ───────────────────────────────────────────────
create table public.membro_equipe (
  id            uuid        primary key default gen_random_uuid(),
  projeto_id    uuid        not null references public.projeto(id) on delete cascade,
  pessoa_id     uuid        not null references auth.users(id) on delete cascade,
  papel_projeto public.papel_projeto not null,                       -- 'host' | 'co_coordenador' | 'aluno'
  indicacao_id  uuid        references public.indicacao(id),         -- rastreia a indicação de origem (auditoria)
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users(id),               -- admin que fechou
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    uuid        references auth.users(id)
);

-- EXATAMENTE 1 host ativo por projeto (UNIQUE parcial) — RN13/CA12
create unique index uq_um_host_por_projeto
  on public.membro_equipe (projeto_id)
  where papel_projeto = 'host' and deleted_at is null;

-- Uma participação ativa por pessoa por projeto
create unique index uq_membro_pessoa_projeto
  on public.membro_equipe (projeto_id, pessoa_id)
  where deleted_at is null;

-- Índice de escopo para as policies/helpers (is_project_host/coordinator/team_member)
create index ix_membro_scope
  on public.membro_equipe (projeto_id, pessoa_id, papel_projeto)
  where deleted_at is null;

-- ── RLS enable+force (deny-by-default — RS1) ────────────────────────────────
alter table public.membro_equipe enable row level security;
alter table public.membro_equipe force  row level security;

-- SELECT: equipe pública (vitrine — RN23). O nome do membro é resolvido por RPC
-- pseudonimizada na 0036 (anônimo sem opt-in → papel+curso). Aqui a linha é pública.
-- INSERT/UPDATE/DELETE diretos: NENHUMA policy → negado; mutação só via fechar_equipe/trocar_host.
create policy membro_equipe_select_publica on public.membro_equipe
  for select to anon, authenticated
  using (deleted_at is null);

-- ── Auditoria (trigger zzz_audit — padrão herdado 0008) ─────────────────────
create trigger zzz_audit after insert or update or delete on public.membro_equipe
  for each row execute function audit.gravar_versao();

-- ── RPC fechar_equipe: compõe equipe + elege host + aprova (ATÔMICO, só admin) ──
-- p_membros = jsonb array de {pessoa_id, papel_projeto, indicacao_id}.
-- Invariantes (RN10/RN11/RN13/CA9/CA10/CA11/CA12 + C-B1):
--   - só admin (is_admin interno)
--   - projeto em em_analise (RN9 — janela)
--   - host (p_host_pessoa_id) tem indicação ATIVA papel_pretendido='coordenador' (RN11 — qualquer curso)
--   - cada membro deriva de indicação ATIVA válida (C-B1)
--   - exatamente 1 host no array, coincidente com p_host_pessoa_id (RN13)
--   - UPDATE projeto em_analise→aprovado + host_coordenador_id + aprovado_em (guarda 0031 grava status_evento)
create or replace function public.fechar_equipe(
  p_projeto_id     uuid,
  p_host_pessoa_id uuid,
  p_membros        jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_membro     jsonb;
  v_pessoa     uuid;
  v_papel      public.papel_projeto;
  v_ind        uuid;
  v_host_count int := 0;
begin
  -- Exclusivo do admin (RN10/CA9)
  if not (select public.is_admin()) then
    raise exception 'fechar_equipe exige admin (RN10/CA9)';
  end if;

  -- Janela: projeto deve estar em em_analise (RN9) — 2ª chamada após aprovado é negada
  if not exists (
    select 1 from public.projeto
    where id = p_projeto_id and status = 'em_analise' and deleted_at is null
  ) then
    raise exception 'projeto nao esta em em_analise — janela de fechamento fechada (RN9)';
  end if;

  -- Host deve ter indicação ATIVA como coordenador (RN11/CA11) — de QUALQUER curso
  if not exists (
    select 1 from public.indicacao
    where projeto_id = p_projeto_id and pessoa_id = p_host_pessoa_id
      and papel_pretendido = 'coordenador' and deleted_at is null
  ) then
    raise exception 'host deve ter indicacao ativa como coordenador (RN11/CA11)';
  end if;

  -- Compõe a equipe: cada membro deriva de indicação ativa válida (C-B1)
  for v_membro in select value from jsonb_array_elements(p_membros)
  loop
    v_pessoa := (v_membro->>'pessoa_id')::uuid;
    v_papel  := (v_membro->>'papel_projeto')::public.papel_projeto;
    v_ind    := (v_membro->>'indicacao_id')::uuid;

    if not exists (
      select 1 from public.indicacao
      where id = v_ind and projeto_id = p_projeto_id and pessoa_id = v_pessoa and deleted_at is null
    ) then
      raise exception 'membro % nao deriva de indicacao ativa valida (C-B1)', v_pessoa;
    end if;

    if v_papel = 'host' then
      v_host_count := v_host_count + 1;
      if v_pessoa <> p_host_pessoa_id then
        raise exception 'host do array (%) difere de p_host_pessoa_id (%) — RN13', v_pessoa, p_host_pessoa_id;
      end if;
    end if;

    insert into public.membro_equipe (projeto_id, pessoa_id, papel_projeto, indicacao_id, created_by)
    values (p_projeto_id, v_pessoa, v_papel, v_ind, (select auth.uid()));
  end loop;

  -- Exatamente 1 host (RN13)
  if v_host_count <> 1 then
    raise exception 'equipe deve ter exatamente 1 host (RN13) — encontrados %', v_host_count;
  end if;

  -- Aprova o projeto (em_analise→aprovado). A guarda (0031) valida is_admin e grava
  -- status_evento(em_analise→aprovado). host_coordenador_id satisfaz host_exigido_apos_aprovacao.
  update public.projeto
     set status              = 'aprovado',
         host_coordenador_id = p_host_pessoa_id,
         aprovado_em         = now(),
         updated_at          = now()
   where id = p_projeto_id;
end; $$;

-- ── Grants provisórios (hardening final na 0038) ─────────────────────────────
grant execute on function public.fechar_equipe(uuid, uuid, jsonb) to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — na ordem inversa)                                       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop function if exists public.fechar_equipe(uuid, uuid, jsonb);
-- drop trigger if exists zzz_audit on public.membro_equipe;
-- drop table if exists public.membro_equipe;
-- ╚══════════════════════════════════════════════════════════════════════════╝
