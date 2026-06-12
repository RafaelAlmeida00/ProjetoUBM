-- Migração 0046 — buscar_empresa: match por SUBSTRING (case-insensitive) + trigram fuzzy
-- Antes: só o operador trigram public.% (threshold ~0.3) → "niss" não achava "Nissan"
--        (similaridade de substring curto vs. nome inteiro fica abaixo do limiar).
-- Agora: ILIKE '%q%' (ambos os lados normalizados p/ minúsculas → ignora caixa) como
--        match principal + trigram como fallback p/ tolerar typo. Ordena prefixo > substring > similaridade.
-- O índice GIN trigram (gin_trgm_ops) já suporta LIKE '%...%', então a performance se mantém.

create or replace function public.buscar_empresa(q text)
returns table(id uuid, nome_canonico text, sim real)
language plpgsql stable security definer set search_path = '' as $$
declare v_norm text := public.normalizar_empresa(q);
begin
  if length(v_norm) < 2 then return; end if;   -- q mínimo: nada de "listar tudo" (RS-A*)
  return query
    select e.id, e.nome_canonico, public.similarity(e.nome_normalizado, v_norm) as sim
    from public.empresa e
    where e.deleted_at is null and e.merged_into is null
      and (
        e.nome_normalizado like '%' || v_norm || '%'       -- substring (caixa-insensível: ambos normalizados)
        or e.nome_normalizado operator(public.%) v_norm     -- fuzzy trigram (tolera erro de digitação)
      )
    order by
      (e.nome_normalizado like v_norm || '%') desc,         -- prefixo primeiro
      (e.nome_normalizado like '%' || v_norm || '%') desc,  -- depois substring
      public.similarity(e.nome_normalizado, v_norm) desc,   -- depois fuzzy
      e.nome_canonico
    limit 10;
end; $$;
