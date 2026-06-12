-- Migração 0013 — merge administrativo reversível (ADR-0004 camada E; RN10/RN11/RN12)

create table public.empresa_merge_log (
  id           uuid primary key default gen_random_uuid(),
  loser_id     uuid not null references public.empresa(id),
  winner_id    uuid not null references public.empresa(id),
  snapshot     jsonb not null default '[]',   -- vínculos da perdedora (com flag moved) p/ undo
  feito_por    uuid references auth.users(id),
  feito_em     timestamptz not null default now(),
  desfeito_por uuid references auth.users(id),
  desfeito_em  timestamptz
);
alter table public.empresa_merge_log enable row level security;
alter table public.empresa_merge_log force  row level security;
create policy merge_log_select_admin on public.empresa_merge_log for select to authenticated
  using ((select public.is_admin()));   -- escrita só via RPC definer (server-only)
create trigger zzz_audit after insert or update or delete on public.empresa_merge_log
  for each row execute function audit.gravar_versao();

-- funde a perdedora na vencedora: reaponta vínculos (trata colisão de PK) + marca fundida + log/snapshot.
create or replace function public.merge_empresa(p_loser uuid, p_winner uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_log uuid; v_snap jsonb;
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  if p_loser = p_winner then raise exception 'loser e winner iguais'; end if;
  -- snapshot ANTES de mover (flag moved = não existia na vencedora)
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', m.user_id, 'papel', m.papel,
           'moved', not exists (select 1 from public.membro_empresa w
                                where w.user_id = m.user_id and w.empresa_id = p_winner)
         )), '[]'::jsonb)
    into v_snap from public.membro_empresa m where m.empresa_id = p_loser;
  -- move os que não colidem; remove o remanescente (já era membro da vencedora)
  update public.membro_empresa m set empresa_id = p_winner
    where m.empresa_id = p_loser
      and not exists (select 1 from public.membro_empresa w
                      where w.user_id = m.user_id and w.empresa_id = p_winner);
  delete from public.membro_empresa where empresa_id = p_loser;
  update public.empresa set merged_into = p_winner, deleted_at = now() where id = p_loser;
  insert into public.empresa_merge_log (loser_id, winner_id, snapshot, feito_por)
    values (p_loser, p_winner, v_snap, (select auth.uid())) returning id into v_log;
  return v_log;
end; $$;
grant execute on function public.merge_empresa(uuid, uuid) to authenticated;

-- desfaz o merge: ressuscita a perdedora, devolve os vínculos e remove os movidos da vencedora.
create or replace function public.desfazer_merge(p_log uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  select * into r from public.empresa_merge_log where id = p_log and desfeito_em is null;
  if r.id is null then raise exception 'merge nao encontrado ou ja desfeito'; end if;
  update public.empresa set merged_into = null, deleted_at = null where id = r.loser_id;  -- ANTES de devolver
  insert into public.membro_empresa (user_id, empresa_id, papel)
    select (e->>'user_id')::uuid, r.loser_id, (e->>'papel')::public.papel_empresa
    from jsonb_array_elements(r.snapshot) e
    on conflict do nothing;
  delete from public.membro_empresa w using jsonb_array_elements(r.snapshot) e
    where w.empresa_id = r.winner_id and w.user_id = (e->>'user_id')::uuid and (e->>'moved')::boolean = true;
  update public.empresa_merge_log set desfeito_em = now(), desfeito_por = (select auth.uid()) where id = p_log;
end; $$;
grant execute on function public.desfazer_merge(uuid) to authenticated;
