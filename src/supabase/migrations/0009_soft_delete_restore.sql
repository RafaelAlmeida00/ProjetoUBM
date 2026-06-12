-- Migração 0009 — restauração reversível (architecture.md §6.2; ADR-0007; RN17/CA17)
-- restore_record: SECURITY DEFINER, gate is_admin, ALLOWLIST de tabelas; nada de SQL livre no CRM.
-- (A própria atualização dispara o trigger de auditoria — restauração fica registrada.)

create or replace function public.restore_record(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  -- allowlist (002 inclui 'curso'; 003-009 estendem dor/empresa/projeto/paleta)
  if p_tabela = 'curso' then
    update public.curso set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.curso', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  else
    raise exception 'tabela nao restauravel: %', p_tabela;
  end if;
end; $$;
grant execute on function public.restore_record(text, uuid) to authenticated;
