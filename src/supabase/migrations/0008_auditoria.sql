-- Migração 0008 — auditoria (architecture.md §6; ADR-0007; RN14/RN15/RN16)
-- Trigger genérico JSONB grava antes/depois + ator real (auth.uid()) DENTRO da transação.
-- (pgAudit nível-2 de DDL é config de instância — fora da migração; ver plan/DELIVER.)

create schema if not exists audit;
revoke all on schema audit from anon, authenticated;   -- server-only (não exposto na API)
grant usage on schema audit to service_role;

create table audit.record_version (
  id         bigint generated always as identity primary key,
  ts         timestamptz not null default now(),
  tabela     text not null,
  record_id  uuid,
  op         text not null,                 -- INSERT|UPDATE|DELETE|RESTORE
  record     jsonb,                          -- estado novo
  old_record jsonb,                          -- estado anterior
  actor_id   uuid default auth.uid(),        -- ator real (RN14)
  actor_role text default (auth.jwt() ->> 'role')
);
create index record_version_ts_brin on audit.record_version using brin (ts);
create index record_version_record_id_idx on audit.record_version (record_id);

-- imutável p/ app; admin lê via RPC (schema não exposto)
alter table audit.record_version enable row level security;
alter table audit.record_version force  row level security;

create or replace function audit.gravar_versao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_id  uuid  := coalesce(
    (v_new->>'id')::uuid, (v_old->>'id')::uuid,
    (v_new->>'user_id')::uuid, (v_old->>'user_id')::uuid
  );
begin
  insert into audit.record_version (tabela, record_id, op, record, old_record)
  values (tg_table_schema || '.' || tg_table_name, v_id, tg_op, v_new, v_old);
  return coalesce(new, old);
end; $$;

-- anexa a cada tabela reversível (prefixo zzz_ => roda após triggers de negócio)
create trigger zzz_audit after insert or update or delete on public.perfil            for each row execute function audit.gravar_versao();
create trigger zzz_audit after insert or update or delete on public.papel_usuario     for each row execute function audit.gravar_versao();
create trigger zzz_audit after insert or update or delete on public.admin_app         for each row execute function audit.gravar_versao();
create trigger zzz_audit after insert or update or delete on public.curso             for each row execute function audit.gravar_versao();
create trigger zzz_audit after insert or update or delete on public.coordenador_curso for each row execute function audit.gravar_versao();
create trigger zzz_audit after insert or update or delete on public.membro_empresa    for each row execute function audit.gravar_versao();

-- leitura do log: SÓ admin (RN16), via RPC (o schema audit não é exposto na API)
create or replace function public.ler_audit(p_limit int default 100)
returns table (ts timestamptz, tabela text, record_id uuid, op text, actor_id uuid, actor_role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  return query
    select v.ts, v.tabela, v.record_id, v.op, v.actor_id, v.actor_role
    from audit.record_version v order by v.ts desc limit p_limit;
end; $$;
grant execute on function public.ler_audit(int) to authenticated;
