-- Migração 0012 — busca (fuzzy) + criação controlada de empresa (ADR-0004; RN5/RN6/RN8/RN9)
-- buscar_empresa: SECURITY DEFINER (anon só lê por aqui), projeção mínima (id, nome, sim), q>=2, LIMIT.
-- pg_trgm default similarity_threshold = 0.30 (operador %) → "sugerir generosamente" (A3).

create or replace function public.buscar_empresa(q text)
returns table (id uuid, nome_canonico text, sim real)
language plpgsql stable security definer set search_path = '' as $$
declare v_norm text := public.normalizar_empresa(q);
begin
  if length(v_norm) < 2 then return; end if;   -- q mínimo: nada de "listar tudo" (RS-A*)
  return query
    select e.id, e.nome_canonico, public.similarity(e.nome_normalizado, v_norm) as sim
    from public.empresa e
    where e.deleted_at is null and e.merged_into is null
      and e.nome_normalizado operator(public.%) v_norm   -- usa índice GIN trigram (qualificado p/ search_path='')
    order by sim desc, e.nome_canonico
    limit 10;
end; $$;
grant execute on function public.buscar_empresa(text) to anon, authenticated;

-- obter_ou_criar_empresa: resolve corrida NO BANCO; devolve SEMPRE uma empresa_id (RN6/CA3/CA5).
create or replace function public.obter_ou_criar_empresa(p_nome text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_norm text := public.normalizar_empresa(p_nome); v_id uuid;
begin
  select id into v_id from public.empresa
    where nome_normalizado = v_norm and deleted_at is null and merged_into is null;
  if v_id is not null then return v_id; end if;
  begin
    insert into public.empresa (nome_canonico, created_by)
      values (p_nome, (select auth.uid())) returning id into v_id;
  exception when unique_violation then                 -- corrida: outra tx criou primeiro
    select id into v_id from public.empresa
      where nome_normalizado = v_norm and deleted_at is null and merged_into is null;
  end;
  return v_id;
end; $$;
grant execute on function public.obter_ou_criar_empresa(text) to authenticated;

-- fila de possíveis duplicatas p/ o admin (RN9/CA8) — mesma noção de similaridade
create or replace function public.listar_duplicatas_possiveis()
returns table (a uuid, nome_a text, b uuid, nome_b text, sim real)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  return query
    select e1.id, e1.nome_canonico, e2.id, e2.nome_canonico,
           public.similarity(e1.nome_normalizado, e2.nome_normalizado) as sim
    from public.empresa e1
    join public.empresa e2 on e1.id < e2.id and e1.nome_normalizado operator(public.%) e2.nome_normalizado
    where e1.deleted_at is null and e1.merged_into is null
      and e2.deleted_at is null and e2.merged_into is null
    order by sim desc;
end; $$;
grant execute on function public.listar_duplicatas_possiveis() to authenticated;
