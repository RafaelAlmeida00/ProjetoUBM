-- Migração 0053 — aprovação de coordenador (Onda 2 / feature 005)
-- security design: onda2-coord-aprovacao-security.md (cybersecurity).
-- Princípio: fail closed — vínculo nasce NÃO-aprovado; todo gate passa a exigir aprovado=true.
-- Depende de: 0003 (coordenador_curso), 0004 (is_admin, is_course_coordinator),
--             0031 (is_dor_course_coordinator), 0036 (equipe_publica),
--             0037 (_projeto_notificar_abertura), 0052 (indicacoes_coordenador).

-- ══════════════════════════════════════════════════════════════════════════════
-- §1 — Colunas novas em coordenador_curso
-- ══════════════════════════════════════════════════════════════════════════════
-- default false = fail closed: linhas legadas tornam-se pendentes (VETO-1 / §6).
-- Backfill de vínculos legítimos pré-existentes deve ser feito em bloco separado
-- (decisão de operação) ou inline abaixo, caso o PO autorize.
-- Para o ambiente PGlite (testes) não há legado; para o hospedado ver §6/VETO-1.
alter table public.coordenador_curso
  add column if not exists aprovado     boolean     not null default false,
  add column if not exists aprovado_por uuid        references auth.users(id),
  add column if not exists aprovado_em  timestamptz;

-- ══════════════════════════════════════════════════════════════════════════════
-- §3 — GATE CRÍTICO: re-criar funções com and cc.aprovado nos 5 pontos (VETO-2)
-- ══════════════════════════════════════════════════════════════════════════════

-- Ponto 2: is_course_coordinator (0004) — helper genérico
create or replace function public.is_course_coordinator(p_curso_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coordenador_curso cc
    where cc.user_id  = (select auth.uid())
      and cc.curso_id = p_curso_id
      and cc.aprovado = true
  );
$$;

-- Ponto 1: is_dor_course_coordinator (0031) — epicentro
create or replace function public.is_dor_course_coordinator(p_projeto_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.projeto        pj
    join public.dor_curso      dc on dc.dor_id    = pj.dor_id
    join public.curso          c  on c.slug       = dc.curso
    join public.coordenador_curso cc on cc.curso_id = c.id
    where pj.id         = p_projeto_id
      and cc.user_id    = (select auth.uid())
      and cc.aprovado   = true
  );
$$;

-- Ponto 3: equipe_publica (0036) — vitrine: string_agg cursos do coord
create or replace function public.equipe_publica(p_projeto_id uuid)
returns table (papel_projeto text, nome text, curso text)
language sql stable security definer set search_path = '' as $$
  select me.papel_projeto::text,
         case when p.ranking_optin then p.nome_publico else null end,
         (select string_agg(c.nome, ', ' order by c.nome)
            from public.coordenador_curso cc
            join public.curso c on c.id = cc.curso_id
           where cc.user_id  = me.pessoa_id
             and cc.aprovado = true)
  from public.membro_equipe me
  join public.perfil p on p.user_id = me.pessoa_id
  where me.projeto_id = p_projeto_id and me.deleted_at is null
  order by me.papel_projeto;
$$;

-- Ponto 4: _projeto_notificar_abertura (0037) — trigger notificação
create or replace function public._projeto_notificar_abertura()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_coord uuid;
begin
  for v_coord in
    select distinct cc.user_id
      from public.dor_curso dc
      join public.curso c              on c.slug      = dc.curso
      join public.coordenador_curso cc on cc.curso_id = c.id
     where dc.dor_id    = new.dor_id
       and cc.aprovado  = true
  loop
    perform public.criar_notificacao(
      v_coord, 'dor_aprovada_curso',
      jsonb_build_object('evento','projeto_aberto','dor_id', new.dor_id::text, 'projeto_id', new.id::text));
  end loop;
  return new;
exception when others then
  return new; -- fail-soft: erro de notificação não impede a abertura
end; $$;

-- Ponto 5: indicacoes_coordenador (0052) — string_agg cursos do candidato
create or replace function public.indicacoes_coordenador(p_projeto_id uuid)
returns table(
  id               uuid,
  projeto_id       uuid,
  pessoa_id        uuid,
  papel_pretendido text,
  mensagem         text,
  created_at       timestamptz,
  deleted_at       timestamptz,
  aluno_nome       text,
  aluno_email      text,
  curso            text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Gate: apenas coordenador-do-curso-da-dor APROVADO ou admin (RS2/CA25)
  if not (
    (select public.is_dor_course_coordinator(p_projeto_id))
    or (select public.is_admin())
  ) then
    return;
  end if;

  return query
    select
      i.id,
      i.projeto_id,
      i.pessoa_id,
      i.papel_pretendido::text,
      i.mensagem,
      i.created_at,
      i.deleted_at,
      coalesce(p.nome_publico, '')          as aluno_nome,
      coalesce(u.email::text, '')           as aluno_email,
      coalesce(
        (select string_agg(c.nome, ', ' order by c.nome)
           from public.coordenador_curso cc
           join public.curso c on c.id = cc.curso_id
          where cc.user_id  = i.pessoa_id
            and cc.aprovado = true),
        (select string_agg(dc.curso::text, ', ' order by dc.curso::text)
           from public.dor_curso dc
           join public.projeto pr on pr.dor_id = dc.dor_id
          where pr.id = p_projeto_id
          limit 1),
        ''
      )                                     as curso
    from public.indicacao i
    join auth.users u  on u.id  = i.pessoa_id
    left join public.perfil p on p.user_id = i.pessoa_id
    where i.projeto_id = p_projeto_id
    order by i.created_at asc;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §2 — RPCs SECURITY DEFINER (onboarding self-service + admin: aprovar/recusar/revogar)
-- ══════════════════════════════════════════════════════════════════════════════

-- onboarding_coordenador: self-service
-- PROIBIDO: parâmetro aprovado; tocar admin_app; papel != coordenador.
create or replace function public.onboarding_coordenador(p_curso_id uuid, p_nome text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Gate de sessão: rejeita chamadas sem identidade
  if v_uid is null then
    raise exception 'autenticacao obrigatoria';
  end if;

  -- Valida p_nome: mínimo 2 caracteres (não-vazio, não espaços)
  if length(trim(p_nome)) < 2 then
    raise exception 'nome invalido: deve ter pelo menos 2 caracteres';
  end if;

  -- Valida p_curso_id: deve existir em public.curso
  if not exists (select 1 from public.curso where id = p_curso_id and deleted_at is null) then
    raise exception 'curso nao encontrado: %', p_curso_id;
  end if;

  -- (a) Grava nome_publico no próprio perfil
  update public.perfil set nome_publico = p_nome where user_id = v_uid;

  -- (b) Concede papel coordenador (idempotente — on conflict do nothing)
  insert into public.papel_usuario(user_id, role)
    values (v_uid, 'coordenador')
    on conflict (user_id, role) do nothing;

  -- (c) Insere vínculo PENDENTE (aprovado=FALSE hard-coded — VETO-3)
  --     on conflict do nothing: preserva aprovado=true se já aprovado (não rebaixa — §2)
  insert into public.coordenador_curso(user_id, curso_id, aprovado)
    values (v_uid, p_curso_id, false)
    on conflict (user_id, curso_id) do nothing;
end; $$;

-- aprovar_coordenador: admin-only
create or replace function public.aprovar_coordenador(p_user_id uuid, p_curso_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Gate duro: só admin (VETO-4)
  if not (select public.is_admin()) then
    raise exception 'forbidden: apenas admin pode aprovar coordenador';
  end if;

  -- Idempotente: predicado aprovado=false — re-aprovar já-aprovado é no-op
  update public.coordenador_curso
     set aprovado    = true,
         aprovado_por = (select auth.uid()),
         aprovado_em  = now()
   where user_id  = p_user_id
     and curso_id = p_curso_id
     and aprovado = false;
end; $$;

-- recusar_coordenador: admin-only; só remove PENDENTES (não revoga aprovados)
create or replace function public.recusar_coordenador(p_user_id uuid, p_curso_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then
    raise exception 'forbidden: apenas admin pode recusar coordenador';
  end if;

  delete from public.coordenador_curso
   where user_id  = p_user_id
     and curso_id = p_curso_id
     and aprovado = false; -- só pendentes; aprovados ficam (intenção explícita)
end; $$;

-- revogar_coordenador: admin-only; remove aprovados (intenção explícita no audit)
create or replace function public.revogar_coordenador(p_user_id uuid, p_curso_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then
    raise exception 'forbidden: apenas admin pode revogar coordenador';
  end if;

  delete from public.coordenador_curso
   where user_id  = p_user_id
     and curso_id = p_curso_id; -- remove qualquer estado (aprovado ou não)
end; $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §5 — HARDENING: revoke + re-grant (CREATE OR REPLACE reseta grants — Memória)
-- ══════════════════════════════════════════════════════════════════════════════

-- Helpers de escopo (re-criados): revoke public + re-grant anon+authenticated
revoke execute on function public.is_course_coordinator(uuid)        from public;
revoke execute on function public.is_dor_course_coordinator(uuid)    from public;
revoke execute on function public.equipe_publica(uuid)               from public;
revoke execute on function public.indicacoes_coordenador(uuid)       from public;
-- trigger fn (re-criada): sem grant a roles de app
revoke execute on function public._projeto_notificar_abertura()      from public;

-- Novas RPCs de mutação: revoke public + grant APENAS authenticated (NUNCA anon — §5)
revoke execute on function public.onboarding_coordenador(uuid, text) from public;
revoke execute on function public.aprovar_coordenador(uuid, uuid)    from public;
revoke execute on function public.recusar_coordenador(uuid, uuid)    from public;
revoke execute on function public.revogar_coordenador(uuid, uuid)    from public;

-- IMPORTANTE (grant-reset-create-or-replace + default privileges do hospedado):
-- o `revoke from public` NÃO remove um grant DIRETO de `anon` que o Supabase aplica via
-- `alter default privileges` em funções novas do schema public. Revogar `anon` EXPLÍCITO
-- nas funções authenticated-only — senão ficam anon-executáveis no hospedado (defesa-em-profundidade).
revoke execute on function public.indicacoes_coordenador(uuid)       from anon;
revoke execute on function public.onboarding_coordenador(uuid, text) from anon;
revoke execute on function public.aprovar_coordenador(uuid, uuid)    from anon;
revoke execute on function public.recusar_coordenador(uuid, uuid)    from anon;
revoke execute on function public.revogar_coordenador(uuid, uuid)    from anon;

-- Re-grants mínimos
grant execute on function public.is_course_coordinator(uuid)        to anon, authenticated;
grant execute on function public.is_dor_course_coordinator(uuid)    to anon, authenticated;
grant execute on function public.equipe_publica(uuid)               to anon, authenticated;
grant execute on function public.indicacoes_coordenador(uuid)       to authenticated;
grant execute on function public.onboarding_coordenador(uuid, text) to authenticated;
grant execute on function public.aprovar_coordenador(uuid, uuid)    to authenticated;
grant execute on function public.recusar_coordenador(uuid, uuid)    to authenticated;
grant execute on function public.revogar_coordenador(uuid, uuid)    to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — na ordem inversa)                                      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop function if exists public.revogar_coordenador(uuid,uuid);
-- drop function if exists public.recusar_coordenador(uuid,uuid);
-- drop function if exists public.aprovar_coordenador(uuid,uuid);
-- drop function if exists public.onboarding_coordenador(uuid,text);
-- -- Re-aplicar versões anteriores de indicacoes_coordenador (0052), equipe_publica (0036),
-- --   _projeto_notificar_abertura (0037), is_dor_course_coordinator (0031), is_course_coordinator (0004)
-- alter table public.coordenador_curso
--   drop column if exists aprovado_em,
--   drop column if exists aprovado_por,
--   drop column if exists aprovado;
-- ╚══════════════════════════════════════════════════════════════════════════╝
