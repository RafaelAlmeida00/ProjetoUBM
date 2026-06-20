-- Migração 0057 — coordenador 1:N via slugs + conceder_representante + conceder_papel bloqueia representante
-- BUG (logs hospedado): conceder_coordenador e onboarding_coordenador recebiam SLUG mas esperavam uuid.
-- Fix: substituir assinaturas antigas (uuid) por novas com curso_ubm[] resolvendo slug→id no banco.
-- Feature: conceder_representante (admin-only) espelha onboarding_representante mas sem self-guards.
-- Fix: conceder_papel bloqueia 'representante' além de 'coordenador'.
-- Depende de: 0003 (coordenador_curso, membro_empresa, papel_usuario, curso),
--             0004 (is_admin), 0027 (onboarding_representante — padrão membro_empresa),
--             0053 (onboarding_coordenador(uuid,text)), 0055 (conceder_coordenador(uuid,uuid), conceder_papel).

-- ══════════════════════════════════════════════════════════════════════════════
-- §1 — DROP das assinaturas antigas (uuid) antes de recriar com curso_ubm[]
-- ══════════════════════════════════════════════════════════════════════════════
-- Assinatura antiga de onboarding_coordenador: (uuid, text) — 0053
drop function if exists public.onboarding_coordenador(uuid, text);

-- Assinatura antiga de conceder_coordenador: (uuid, uuid) — 0055
-- HARDENING de 0055 revogou grants desta assinatura; drop limpa o slot.
drop function if exists public.conceder_coordenador(uuid, uuid);

-- ══════════════════════════════════════════════════════════════════════════════
-- §2 — onboarding_coordenador(p_curso_slugs curso_ubm[], p_nome text)
-- Self-service: papel + N vínculos pendentes (aprovado=false) resolvendo slug→id.
-- Espelha onboarding_aluno (0047): array de slugs, resolve no banco.
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.onboarding_coordenador(
  p_curso_slugs public.curso_ubm[],
  p_nome        text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_inserido int;
begin
  -- Guarda 1: sessão obrigatória
  if v_uid is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  -- Guarda 2: nome mínimo 2 chars
  if length(trim(p_nome)) < 2 then
    raise exception 'nome invalido: deve ter pelo menos 2 caracteres';
  end if;

  -- (a) Grava/atualiza nome_publico no perfil
  insert into public.perfil(user_id, nome_publico)
    values (v_uid, p_nome)
    on conflict (user_id)
    do update set
      nome_publico = coalesce(excluded.nome_publico, public.perfil.nome_publico),
      updated_at   = now();

  -- (b) Concede papel coordenador (idempotente)
  insert into public.papel_usuario(user_id, role)
    values (v_uid, 'coordenador')
    on conflict (user_id, role) do nothing;

  -- (c) Insere N vínculos pendentes (aprovado=false) — on conflict do nothing: preserva aprovado=true
  insert into public.coordenador_curso(user_id, curso_id, aprovado)
    select v_uid, c.id, false
      from public.curso c
     where c.slug = any(p_curso_slugs)
       and c.deleted_at is null
    on conflict (user_id, curso_id) do nothing;

  -- Guarda 3: pelo menos 1 slug resolveu para curso válido
  get diagnostics v_inserido = row_count;
  -- row_count acima pode ser 0 se todos já existiam (on conflict); checar pela existência real
  if not exists (
    select 1 from public.coordenador_curso where user_id = v_uid
  ) then
    raise exception 'nenhum curso valido encontrado para os slugs fornecidos';
  end if;

  -- Contabilizar cursos resolvidos dos slugs fornecidos (não só os inseridos agora)
  if not exists (
    select 1
      from public.curso c
     where c.slug = any(p_curso_slugs)
       and c.deleted_at is null
  ) then
    raise exception 'nenhum curso valido encontrado para os slugs fornecidos';
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §3 — conceder_coordenador(p_user_id uuid, p_curso_slugs curso_ubm[]) admin-only
-- Substitui assinatura antiga (uuid, uuid). Resolve slugs→id, upsert aprovado=true.
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.conceder_coordenador(
  p_user_id     uuid,
  p_curso_slugs public.curso_ubm[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolvidos int;
begin
  if not (select public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Valida que pelo menos 1 slug resolve para curso não-deletado
  select count(*) into v_resolvidos
    from public.curso c
   where c.slug = any(p_curso_slugs)
     and c.deleted_at is null;

  if v_resolvidos = 0 then
    raise exception 'nenhum curso valido encontrado para os slugs fornecidos'
      using errcode = '22023';
  end if;

  -- Garante papel coordenador (idempotente)
  insert into public.papel_usuario(user_id, role)
    values (p_user_id, 'coordenador')
    on conflict (user_id, role) do nothing;

  -- Upsert N vínculos aprovados=true com não-repúdio (aprovado_por = auth.uid())
  insert into public.coordenador_curso(user_id, curso_id, aprovado, aprovado_por, aprovado_em)
    select p_user_id, c.id, true, (select auth.uid()), now()
      from public.curso c
     where c.slug = any(p_curso_slugs)
       and c.deleted_at is null
    on conflict (user_id, curso_id) do update
      set aprovado     = true,
          aprovado_por = (select auth.uid()),
          aprovado_em  = now();
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §4 — conceder_representante(p_user_id uuid, p_empresa_id uuid) admin-only
-- Espelha membro_empresa do onboarding_representante (0027) sem guards de self-service.
-- dept/cargo/email_corporativo opcionais (null) — admin vincula; rep completa depois.
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.conceder_representante(
  p_user_id   uuid,
  p_empresa_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Valida empresa: deve existir, não-deletada e não-fundida
  if not exists (
    select 1 from public.empresa e
     where e.id = p_empresa_id
       and e.deleted_at  is null
       and e.merged_into is null
  ) then
    raise exception 'empresa nao encontrada ou invalida: %', p_empresa_id
      using errcode = '22023';
  end if;

  -- Papel representante (idempotente)
  insert into public.papel_usuario(user_id, role)
    values (p_user_id, 'representante')
    on conflict (user_id, role) do nothing;

  -- Vínculo membro_empresa (idempotente — on conflict do nothing preserva dept/cargo existentes)
  insert into public.membro_empresa(user_id, empresa_id, papel)
    values (p_user_id, p_empresa_id, 'representante')
    on conflict (user_id, empresa_id) do nothing;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §5 — conceder_papel RECRIADA: bloqueia 'coordenador' E 'representante'
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.conceder_papel(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Bloquear coordenador: exige curso (use conceder_coordenador)
  if p_role = 'coordenador' then
    raise exception 'use conceder_coordenador(p_user_id, p_curso_slugs) para conceder papel coordenador com vinculo de curso obrigatorio'
      using errcode = '22023';
  end if;

  -- Bloquear representante: exige empresa (use conceder_representante)
  if p_role = 'representante' then
    raise exception 'use conceder_representante(p_user_id, p_empresa_id) para conceder papel representante com vinculo de empresa obrigatorio'
      using errcode = '22023';
  end if;

  insert into public.papel_usuario(user_id, role)
    values (p_user_id, p_role)
    on conflict (user_id, role) do nothing;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §H — HARDENING: revoke from public + revoke from anon EXPLÍCITO + grant to authenticated
-- Gotcha hospedado: CREATE OR REPLACE reseta grants; ALTER DEFAULT PRIVILEGES do Supabase
-- concede anon em funções novas → revogar anon explicitamente (memória: grant-reset-create-or-replace).
-- ══════════════════════════════════════════════════════════════════════════════

-- onboarding_coordenador (nova assinatura — authenticated self-service)
revoke execute on function public.onboarding_coordenador(public.curso_ubm[], text) from public;
revoke execute on function public.onboarding_coordenador(public.curso_ubm[], text) from anon;
grant  execute on function public.onboarding_coordenador(public.curso_ubm[], text) to authenticated;

-- conceder_coordenador (nova assinatura — admin-only)
revoke execute on function public.conceder_coordenador(uuid, public.curso_ubm[]) from public;
revoke execute on function public.conceder_coordenador(uuid, public.curso_ubm[]) from anon;
grant  execute on function public.conceder_coordenador(uuid, public.curso_ubm[]) to authenticated;

-- conceder_representante (nova — admin-only)
revoke execute on function public.conceder_representante(uuid, uuid) from public;
revoke execute on function public.conceder_representante(uuid, uuid) from anon;
grant  execute on function public.conceder_representante(uuid, uuid) to authenticated;

-- conceder_papel recriada (mesma assinatura — re-hardening obrigatório por CREATE OR REPLACE)
revoke execute on function public.conceder_papel(uuid, public.app_role) from public;
revoke execute on function public.conceder_papel(uuid, public.app_role) from anon;
grant  execute on function public.conceder_papel(uuid, public.app_role) to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — na ordem inversa)                                      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop function if exists public.conceder_representante(uuid, uuid);
-- drop function if exists public.conceder_coordenador(uuid, public.curso_ubm[]);
-- drop function if exists public.onboarding_coordenador(public.curso_ubm[], text);
-- -- Restaurar conceder_coordenador(uuid, uuid) da 0055:
-- -- create or replace function public.conceder_coordenador(p_user_id uuid, p_curso_id uuid) ...
-- -- Restaurar onboarding_coordenador(uuid, text) da 0053:
-- -- create or replace function public.onboarding_coordenador(p_curso_id uuid, p_nome text) ...
-- -- Restaurar conceder_papel sem bloqueio de representante (versão 0055):
-- -- create or replace function public.conceder_papel(p_user_id uuid, p_role public.app_role) ...
-- ╚══════════════════════════════════════════════════════════════════════════╝
