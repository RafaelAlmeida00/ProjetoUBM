-- Migração 0026 — trigger _paleta_desativa_orfa em public.empresa (feature 007-theming-paletas)
-- Quando empresa é mesclada (merged_into IS NOT NULL) ou soft-deletada (deleted_at IS NOT NULL),
-- desativa todas as paletas ativas daquela empresa. A paleta NÃO migra para a vencedora (RN12).
-- Contrato: contracts/paleta.md §8 (órfã) · architecture.md §5.2 · spec RN12/CA9b
-- Depende de: 0024 (tabela paleta), 0011 (empresa), 0008 (audit.gravar_versao)

create or replace function public._paleta_desativa_orfa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Dispara apenas quando a empresa passa DE viva (merged_into IS NULL e deleted_at IS NULL)
  -- PARA órfã (merged_into IS NOT NULL OU deleted_at IS NOT NULL).
  -- Idempotência: se a empresa já estava órfã antes do UPDATE, não dispara novamente.
  if (new.merged_into is not null or new.deleted_at is not null)
     and (old.merged_into is null and old.deleted_at is null)
  then
    update public.paleta
       set ativa = false,
           updated_at = now()
     where empresa_id = new.id
       and ativa = true;
  end if;
  return new;
end; $$;

-- Trigger AFTER UPDATE em empresa (não BEFORE: precisamos do NEW já gravado para o zzz_audit disparar)
create trigger paleta_orfa
  after update on public.empresa
  for each row execute function public._paleta_desativa_orfa();

-- Trigger function não recebe grant de aplicação (chamada pelo runtime via trigger).
-- Revoga de public E anon E authenticated (Supabase auto-concede a anon/authenticated em fn novas;
-- esta fn não deve ser chamável via PostgREST /rpc/ por ninguém — só pelo trigger). Advisor 0028.
revoke execute on function public._paleta_desativa_orfa() from public, anon, authenticated;
