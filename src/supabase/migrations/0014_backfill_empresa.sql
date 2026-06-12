-- Migração 0014 — backfill do legado proposal.empresa (texto livre) -> empresa canônica (ADR-0004; RN14/RN15; A6/A7)
-- Fase 1: coluna empresa_id (nullable, aditiva). Fases 2/3: propor grupos + fixar APÓS revisão humana (admin).
-- O texto legado proposal.empresa é PRESERVADO; a substituição efetiva (not null) é da 004.

alter table public.proposal add column empresa_id uuid references public.empresa(id);

-- propõe: cria UMA empresa canônica por nome normalizado distinto do legado (1ª grafia por created_at) e devolve os grupos.
create or replace function public.propor_backfill_empresas()
returns table (nome_normalizado text, qtd bigint, empresa_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  insert into public.empresa (nome_canonico, created_by)
    select distinct on (public.normalizar_empresa(p.empresa)) p.empresa, (select auth.uid())
    from public.proposal p
    where p.empresa_id is null and length(btrim(coalesce(p.empresa, ''))) > 0
      and not exists (select 1 from public.empresa e
                      where e.nome_normalizado = public.normalizar_empresa(p.empresa)
                        and e.deleted_at is null and e.merged_into is null)
    order by public.normalizar_empresa(p.empresa), p.created_at
    on conflict do nothing;
  return query
    select public.normalizar_empresa(p.empresa) nn, count(*) qtd, e.id
    from public.proposal p
    join public.empresa e on e.nome_normalizado = public.normalizar_empresa(p.empresa)
      and e.deleted_at is null and e.merged_into is null
    where p.empresa_id is null and length(btrim(coalesce(p.empresa, ''))) > 0
    group by 1, e.id;
end; $$;
grant execute on function public.propor_backfill_empresas() to authenticated;

-- fixa o grupo APÓS revisão: aponta proposal.empresa_id para a canônica (texto preservado). Admin.
create or replace function public.aplicar_backfill_grupo(p_empresa_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_norm text; v_n int;
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  select nome_normalizado into v_norm from public.empresa where id = p_empresa_id;
  update public.proposal p set empresa_id = p_empresa_id
    where p.empresa_id is null and public.normalizar_empresa(p.empresa) = v_norm;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
grant execute on function public.aplicar_backfill_grupo(uuid) to authenticated;

-- A6 (split): admin pode fixar UMA proposta específica em outra empresa antes/depois (dividir grupo errado).
create or replace function public.aplicar_backfill_proposal(p_proposal_id uuid, p_empresa_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  update public.proposal set empresa_id = p_empresa_id where id = p_proposal_id;
end; $$;
grant execute on function public.aplicar_backfill_proposal(uuid, uuid) to authenticated;
