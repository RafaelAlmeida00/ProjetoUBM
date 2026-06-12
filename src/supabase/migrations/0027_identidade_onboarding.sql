-- Migração 0027 — identidade/onboarding delta (feature 004 re-entrada)
-- architecture.md §D.2/D.3/D.4/D.5/D.9 · spec §D RN21-26/CA24-30
-- security.md §Delta RS-ID1/RS-ID1a/RS-ID2/RS-ID3/RS-ID5/RS-ID7/RS-ID8/RS-ID9
-- ADR-004C (dept/cargo em membro_empresa) · ADR-004D (self-service via RPC definer)
-- Depende de: 0003 (membro_empresa/curso/papel_usuario), 0005 (RLS base),
--             0007 (is_email_corporativo/assumir_papel), 0008 (audit),
--             0011/0012 (empresa canônica), 0004 (esta_verificado),
--             0025 (restore_record com ramo paleta — COPIADO abaixo para manter consistência)

-- ─── 1. colunas departamento / cargo em membro_empresa ─────────────────────
-- ADR-004C: dept/cargo são do vínculo pessoa↔empresa (semântica correta).
-- Nullable: o vínculo pode existir sem cargo declarado; onboarding/skip preenche.
alter table public.membro_empresa
  add column if not exists departamento text,
  add column if not exists cargo        text;

-- ─── 2. tabela public.aluno_curso ──────────────────────────────────────────
-- N:N user↔curso (self-service do aluno); espelha coordenador_curso mas com escrita own.
-- RS-ID2: write own-only + leitura conforme matriz 002.
-- RS-ID8: enable+force RLS (deny-by-default, anti CVE-2025-48757).
create table if not exists public.aluno_curso (
  user_id    uuid not null references auth.users(id) on delete cascade,
  curso_id   uuid not null references public.curso(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, curso_id)   -- impede curso duplicado p/ o mesmo aluno (CA25/RN23)
);

-- índice em curso_id (espelha coordenador_curso_curso_idx — usado em consulta/policy; perf RLS)
create index if not exists aluno_curso_curso_idx on public.aluno_curso (curso_id);

-- RLS enable+force (deny-by-default)
alter table public.aluno_curso enable row level security;
alter table public.aluno_curso force  row level security;

-- trigger de auditoria (toda mutação auditada — RN20 / padrão 0008)
create trigger zzz_audit_aluno_curso
  after insert or update or delete on public.aluno_curso
  for each row execute function audit.gravar_versao();

-- ── Policies de aluno_curso ─────────────────────────────────────────────────
-- SELECT: próprio + admin (conservador por default — 005 pedirá mais se necessário)
create policy aluno_curso_select on public.aluno_curso
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- INSERT self-service: own-only + verificado (CA25/RS-ID2)
-- Declarar-se aluno de um curso NÃO concede privilégio (RN23) → self-service é seguro.
create policy aluno_curso_insert_own on public.aluno_curso
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.esta_verificado()));

-- DELETE self-service: own-only (aluno remove seus próprios cursos)
create policy aluno_curso_delete_own on public.aluno_curso
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ADMIN: override auditado (correção/remoção pelo admin)
create policy aluno_curso_admin_write on public.aluno_curso
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ─── 3. RPC onboarding_representante ───────────────────────────────────────
-- Self-service da identidade do representante: papel + vínculo membro_empresa + nome.
-- SECURITY DEFINER para escrever em membro_empresa (admin-only por RLS na 0005).
-- RS-ID1 [DURO]: guarda de sessão + e-mail corporativo + empresa canônica + papel fixo.
-- RS-ID1a [DURO]: teto de vínculos self-service (~3 ativos).
-- CA24/CA27/CA30. Não toca coordenador_curso nem admin_app.
create or replace function public.onboarding_representante(
  p_empresa_id   uuid,   -- empresa canônica já resolvida (combobox → obter_ou_criar_empresa)
  p_nome         text,   -- nome de exibição (→ perfil.nome_publico)
  p_departamento text,   -- → membro_empresa.departamento
  p_cargo        text    -- → membro_empresa.cargo
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text := (select auth.jwt() ->> 'email');
  v_total  int;
begin
  -- Guarda 1: sessão obrigatória; vínculo sempre do próprio usuário (anti-spoofing CA30)
  if v_uid is null then
    raise exception 'sessao necessaria';
  end if;

  -- Guarda 2: e-mail corporativo (reusa 0007; CA23/CA30)
  if not (select public.is_email_corporativo(v_email)) then
    raise exception 'representante exige e-mail corporativo';
  end if;

  -- Guarda 3: empresa canônica existente e não-merged (RN6 — nunca texto livre)
  if p_empresa_id is null or not exists (
    select 1 from public.empresa e
     where e.id = p_empresa_id
       and e.deleted_at is null
       and e.merged_into is null
  ) then
    raise exception 'empresa canonica inexistente ou invalida';
  end if;

  -- Guarda 4: teto anti-abuso RS-ID1a (~3 vínculos self-service)
  -- Conta vínculos com papel 'representante' já existentes para este usuário.
  -- Admin pode exceder via membro_empresa_admin_write (0005).
  select count(*) into v_total
    from public.membro_empresa me
   where me.user_id = v_uid
     and me.papel = 'representante';

  -- Apenas bloqueia self-insert quando o usuário já tem >= 3 vínculos E o vínculo
  -- alvo ainda não existe (on conflict abaixo cobre atualização de vínculo existente).
  if v_total >= 3 and not exists (
    select 1 from public.membro_empresa me
     where me.user_id = v_uid and me.empresa_id = p_empresa_id
  ) then
    raise exception 'limite de vinculos self-service atingido (maximo 3); contate o admin';
  end if;

  -- Passo 4: papel-base representante (acumulável — idempotente)
  insert into public.papel_usuario (user_id, role)
  values (v_uid, 'representante')
  on conflict do nothing;

  -- Passo 5: vínculo self-link (cria ou atualiza dept/cargo — idempotente)
  insert into public.membro_empresa (user_id, empresa_id, papel, departamento, cargo)
  values (v_uid, p_empresa_id, 'representante', p_departamento, p_cargo)
  on conflict (user_id, empresa_id)
  do update set
    departamento = excluded.departamento,
    cargo        = excluded.cargo;

  -- Passo 6: nome de exibição (não sobrescreve com null)
  insert into public.perfil (user_id, nome_publico)
  values (v_uid, p_nome)
  on conflict (user_id)
  do update set
    nome_publico = coalesce(excluded.nome_publico, public.perfil.nome_publico),
    updated_at   = now();
  -- NUNCA toca verificado_em (A1 intocada — só verificar_conta altera)
end; $$;

-- ─── 4. RPC onboarding_aluno ────────────────────────────────────────────────
-- Self-service do aluno: papel + aluno_curso + nome. Sem guarda de e-mail corporativo.
-- SECURITY DEFINER para escrever em papel_usuario (admin-only por RLS na 0005).
-- RS-ID2: aluno_curso own-only via RLS (já tem policy); esta RPC garante atomicidade.
-- CA25/RN23. Não toca membro_empresa nem coordenador_curso.
create or replace function public.onboarding_aluno(
  p_nome      text,
  p_curso_ids uuid[]   -- IDs dos cursos da lista fechada (público.curso)
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Guarda: sessão obrigatória
  if v_uid is null then
    raise exception 'sessao necessaria';
  end if;

  -- Papel-base aluno (acumulável — idempotente)
  insert into public.papel_usuario (user_id, role)
  values (v_uid, 'aluno')
  on conflict do nothing;

  -- Vínculos aluno↔curso (idempotente — on conflict do nothing previne duplicata CA25)
  if p_curso_ids is not null then
    insert into public.aluno_curso (user_id, curso_id)
    select v_uid, x
      from unnest(p_curso_ids) x
    on conflict do nothing;
  end if;

  -- Nome de exibição (não sobrescreve com null)
  insert into public.perfil (user_id, nome_publico)
  values (v_uid, p_nome)
  on conflict (user_id)
  do update set
    nome_publico = coalesce(excluded.nome_publico, public.perfil.nome_publico),
    updated_at   = now();
end; $$;

-- ─── 5. restore_record (allowlist da 004) ──────────────────────────────────
-- Redefine public.restore_record(text, uuid) com os ramos da 004:
-- curso, empresa, dor, anexo_dor (igual à 0020 — mantida explícita aqui para
-- documentar o allowlist completo da feature). O ramo 'paleta' é da 007 (0025)
-- e a reconciliação dos allowlists ocorre no MERGE 004↔007, fora deste worktree.
create or replace function public.restore_record(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;

  if p_tabela = 'curso' then
    update public.curso set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.curso', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'empresa' then
    update public.empresa set deleted_at = null, deleted_by = null where id = p_id and merged_into is null;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.empresa', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'dor' then
    -- Restaurar dor soft-deletada (RN20) — ramo adicionado em 0020
    update public.dor set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.dor', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'anexo_dor' then
    -- Restaurar anexo soft-deletado (RN20) — ramo adicionado em 0020
    update public.anexo_dor set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.anexo_dor', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  -- NOTA (worktree 004 isolada): o ramo 'paleta' pertence à feature 007 (migração 0025);
  -- a reconciliação dos allowlists (dor/anexo + paleta) ocorre no MERGE 004↔007, não aqui.

  else
    raise exception 'tabela nao restauravel: %', p_tabela;
  end if;
end; $$;

-- ─── 6. erasure_titular estendida: dept/cargo em membro_empresa (RS-ID5) ───
-- Anonimiza dept/cargo na identidade do representante (linha viva em membro_empresa).
-- Os campos dor.departamento/dor.cargo já eram cobertos em 0020 (dor viva).
-- Esta extensão cobre as COLUNAS NOVAS em membro_empresa (RS-ID5 [DURO]).
-- aluno_curso: remove vínculos do titular (PII de educação; RS-ID-LGPD1).
create or replace function public.erasure_titular(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  -- Anonimiza perfil e auth (herdado de 0010)
  update public.perfil set nome_publico = '[removido]', avatar_url = null where user_id = p_user_id;
  update auth.users set email = 'removed-' || p_user_id::text || '@example.invalid' where id = p_user_id;
  update public.notificacao set payload = '{}'::jsonb where destinatario_id = p_user_id;
  -- Anonimiza PII da dor viva (herdado de 0020 — rep_nome/descricao/departamento/cargo)
  update public.dor
     set rep_nome     = '[removido]',
         descricao    = '[removido]',
         departamento = null,
         cargo        = null,
         updated_at   = now()
   where autor_id = p_user_id and deleted_at is null;
  -- Anonimiza dept/cargo na identidade do representante (RS-ID5 — colunas novas em 0027)
  update public.membro_empresa
     set departamento = null,
         cargo        = null
   where user_id = p_user_id;
  -- Remove vínculos aluno↔curso do titular (RS-ID-LGPD1 — dado de educação pessoal)
  delete from public.aluno_curso where user_id = p_user_id;
  -- Registra intenção de apagar objetos Storage do titular (execução real é Onda 4 / Maestro)
  insert into audit.record_version (tabela, record_id, op, record)
    values (
      'public.anexo_dor',
      p_user_id,
      'ERASURE_STORAGE_PENDING',
      jsonb_build_object('user_id', p_user_id, 'nota', 'objetos Storage do titular a apagar no real (Onda 4)')
    );
  -- Anonimiza log de auditoria (herdado de 0010 + campos da dor + identidade)
  update audit.record_version
     set record     = record     - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url' - 'descricao' - 'departamento' - 'cargo',
         old_record = old_record - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url' - 'descricao' - 'departamento' - 'cargo'
   where actor_id = p_user_id or record_id = p_user_id;
  insert into audit.record_version (tabela, record_id, op, record)
    values ('public.perfil', p_user_id, 'ERASURE', jsonb_build_object('user_id', p_user_id));
end; $$;

-- ─── 7. hardening: revoke execute from public + grants mínimos (padrão 0023) ─
-- RS-ID7/RS-ID9 [DURO]: toda nova RPC DEFINER do delta sem execute para PUBLIC.
-- RS-ID10: search_path='' já aplicado nas funções acima.

-- restore_record: re-revogado e re-concedido (função redefinida — padrão 0025)
revoke execute on function public.restore_record(text, uuid) from public;
grant  execute on function public.restore_record(text, uuid) to authenticated;

-- erasure_titular: re-revogado e re-concedido (função redefinida)
revoke execute on function public.erasure_titular(uuid) from public;
grant  execute on function public.erasure_titular(uuid) to authenticated;

-- onboarding_representante: authenticated apenas (self-service logado; nunca anon)
revoke execute on function public.onboarding_representante(uuid, text, text, text) from public;
grant  execute on function public.onboarding_representante(uuid, text, text, text) to authenticated;

-- onboarding_aluno: authenticated apenas (self-service logado; nunca anon)
revoke execute on function public.onboarding_aluno(text, uuid[]) from public;
grant  execute on function public.onboarding_aluno(text, uuid[]) to authenticated;
