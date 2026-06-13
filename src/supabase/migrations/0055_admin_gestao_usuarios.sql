-- Migração 0055 — admin: gestão completa de usuários (Onda 2 / feature 005)
-- security design: onda2-admin-gestao-usuarios-security.md (cybersecurity, VETO-conditions).
-- Depende de: 0003 (admin_app, papel_usuario, coordenador_curso, perfil, curso),
--             0004 (is_admin), 0043 (conceder_papel — recriada aqui com assinatura nova).
-- Todas as RPCs: security definer, set search_path = 'public', gate is_admin() interno.

-- ══════════════════════════════════════════════════════════════════════════════
-- §1 — conceder_admin(p_user_id uuid) — admin-only, idempotente
-- ══════════════════════════════════════════════════════════════════════════════
-- STRIDE/Elevation: só admin concede admin. Sem gate = qualquer authenticated vira admin.
create or replace function public.conceder_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.admin_app(user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §2 — revogar_admin(p_user_id uuid) — admin-only, DOIS guards críticos
-- ══════════════════════════════════════════════════════════════════════════════
-- GUARD A: self-revoke proibido (no banco — inescapável por qualquer caminho).
-- GUARD B: lockout — nunca remover o último admin (VETO-condition, STRIDE/DoS).
create or replace function public.revogar_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Guard A: auto-revogação proibida
  if p_user_id = auth.uid() then
    raise exception 'admin nao pode revogar o proprio admin' using errcode = '42501';
  end if;

  -- Guard B: lockout — proteger o último admin da plataforma
  if (select count(*) from public.admin_app) <= 1 then
    raise exception 'nao e possivel remover o ultimo admin da plataforma' using errcode = '23514';
  end if;

  delete from public.admin_app where user_id = p_user_id;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §3 — revogar_papel(p_user_id uuid, p_role public.app_role) — admin-only
-- ══════════════════════════════════════════════════════════════════════════════
-- Se p_role = 'coordenador': também limpa coordenador_curso (estado consistente,
-- atômico na mesma transação — STRIDE/Tampering: sem papel órfão).
create or replace function public.revogar_papel(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.papel_usuario
   where user_id = p_user_id
     and role    = p_role;

  -- Limpeza atômica: revogação de coordenador remove vínculos de curso
  if p_role = 'coordenador' then
    delete from public.coordenador_curso where user_id = p_user_id;
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §4 — conceder_coordenador(p_user_id uuid, p_curso_id uuid) — admin-only
-- ══════════════════════════════════════════════════════════════════════════════
-- RPC dedicada (não estende conceder_papel): força curso por assinatura (fail-safe).
-- Nasce aprovado=true (admin é a autoridade). Não-repúdio: aprovado_por = auth.uid().
-- Valida que o curso existe antes de inserir.
create or replace function public.conceder_coordenador(p_user_id uuid, p_curso_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Valida curso (não pode conceder para curso inexistente)
  if not exists (select 1 from public.curso where id = p_curso_id and deleted_at is null) then
    raise exception 'curso nao encontrado: %', p_curso_id using errcode = '22023';
  end if;

  -- Garante o papel coordenador (idempotente)
  insert into public.papel_usuario(user_id, role)
    values (p_user_id, 'coordenador')
    on conflict (user_id, role) do nothing;

  -- Upsert vínculo com curso — nasce aprovado, registra o admin que aprovou
  insert into public.coordenador_curso(user_id, curso_id, aprovado, aprovado_por, aprovado_em)
    values (p_user_id, p_curso_id, true, auth.uid(), now())
    on conflict (user_id, curso_id) do update
      set aprovado    = true,
          aprovado_por = auth.uid(),
          aprovado_em  = now();
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §5 — conceder_papel(p_user_id uuid, p_role public.app_role) — RECRIADA
-- ══════════════════════════════════════════════════════════════════════════════
-- Assinatura muda de (uuid, text) para (uuid, public.app_role):
--   drop da versão anterior (text) necessário por mudança de tipo.
-- Bloqueia p_role='coordenador' (raise) — força caminho conceder_coordenador com curso.
-- Aluno/representante: comportamento normal (idempotente via on conflict do nothing).
drop function if exists public.conceder_papel(uuid, text);

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

  -- Bloquear coordenador: exige curso obrigatório (use conceder_coordenador)
  if p_role = 'coordenador' then
    raise exception 'use conceder_coordenador(p_user_id, p_curso_id) para conceder papel coordenador com vinculo de curso obrigatorio'
      using errcode = '22023';
  end if;

  insert into public.papel_usuario(user_id, role)
    values (p_user_id, p_role)
    on conflict (user_id, role) do nothing;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §6 — admin_editar_perfil(p_user_id uuid, p_nome_publico text) — admin-only DEFINER
-- ══════════════════════════════════════════════════════════════════════════════
-- Whitelist: APENAS nome_publico (NUNCA email/oauth/verificado — menor privilégio).
-- Validação de input: trim + >= 2 chars (rejeita vazio/espaços).
-- RPC DEFINER admin-only (não policy ampla na tabela — menor blast radius, mais auditável).
create or replace function public.admin_editar_perfil(p_user_id uuid, p_nome_publico text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_nome text := trim(p_nome_publico);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Validação de input: nome mínimo 2 chars após trim
  if length(v_nome) < 2 then
    raise exception 'nome invalido: deve ter pelo menos 2 caracteres apos trim'
      using errcode = '22023';
  end if;

  -- Whitelist: somente nome_publico (nunca email, verificado_em, avatar_url via este caminho)
  update public.perfil
     set nome_publico = v_nome,
         updated_at   = now()
   where user_id = p_user_id;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §H — HARDENING: revoke public + revoke anon explícito + grant authenticated
-- ══════════════════════════════════════════════════════════════════════════════
-- Gotcha hospedado (Memória: grant-reset-create-or-replace + supabase-anon-default-privileges):
-- CREATE OR REPLACE reseta EXECUTE para PUBLIC.
-- ALTER DEFAULT PRIVILEGES do Supabase concede anon em funções novas automaticamente.
-- Necessário: revoke from public E revoke from anon EXPLÍCITO + grant to authenticated.

revoke execute on function public.conceder_admin(uuid)                   from public;
revoke execute on function public.conceder_admin(uuid)                   from anon;
grant  execute on function public.conceder_admin(uuid)                   to authenticated;

revoke execute on function public.revogar_admin(uuid)                    from public;
revoke execute on function public.revogar_admin(uuid)                    from anon;
grant  execute on function public.revogar_admin(uuid)                    to authenticated;

revoke execute on function public.revogar_papel(uuid, public.app_role)   from public;
revoke execute on function public.revogar_papel(uuid, public.app_role)   from anon;
grant  execute on function public.revogar_papel(uuid, public.app_role)   to authenticated;

revoke execute on function public.conceder_coordenador(uuid, uuid)       from public;
revoke execute on function public.conceder_coordenador(uuid, uuid)       from anon;
grant  execute on function public.conceder_coordenador(uuid, uuid)       to authenticated;

revoke execute on function public.admin_editar_perfil(uuid, text)        from public;
revoke execute on function public.admin_editar_perfil(uuid, text)        from anon;
grant  execute on function public.admin_editar_perfil(uuid, text)        to authenticated;

-- conceder_papel recriada com assinatura nova (uuid, app_role) — re-hardening obrigatório
revoke execute on function public.conceder_papel(uuid, public.app_role)  from public;
revoke execute on function public.conceder_papel(uuid, public.app_role)  from anon;
grant  execute on function public.conceder_papel(uuid, public.app_role)  to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — na ordem inversa)                                      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop function if exists public.admin_editar_perfil(uuid, text);
-- drop function if exists public.conceder_coordenador(uuid, uuid);
-- drop function if exists public.revogar_papel(uuid, public.app_role);
-- drop function if exists public.revogar_admin(uuid);
-- drop function if exists public.conceder_admin(uuid);
-- -- Restaurar conceder_papel com assinatura (uuid, text) da 0043:
-- drop function if exists public.conceder_papel(uuid, public.app_role);
-- create or replace function public.conceder_papel(p_user_id uuid, p_role text) ...
-- ╚══════════════════════════════════════════════════════════════════════════╝
