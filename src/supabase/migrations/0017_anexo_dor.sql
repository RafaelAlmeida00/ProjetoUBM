-- Migração 0017 — tabela public.anexo_dor (metadados de anexo; arquivo no Storage) (feature 004)
-- architecture.md §2.4; spec §7 CA14/CA15; security.md RS-A1/RS-A2/RS-A3/RS-A4.
-- Depende de: 0015 (dor), 0008 (audit).
-- NUNCA bytes no Postgres (RS-A1) — só metadados; arquivo vive no bucket dor-anexos (0019).

create table public.anexo_dor (
  id             uuid primary key default gen_random_uuid(),
  dor_id         uuid not null references public.dor(id) on delete cascade,
  -- Path no bucket dor-anexos; convenção dor/{dor_id}/{uuid}-{nome} (RS-A8)
  storage_path   text not null unique,
  nome_original  text not null,
  -- MIME validado contra allowlist (RS-A3); deny-by-default (security §3.3)
  mime_type      text not null check (
    mime_type in (
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/pdf',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  ),
  -- Tamanho <= 5 MB (RS-A2/security §3.3)
  tamanho_bytes  bigint not null check (tamanho_bytes > 0 and tamanho_bytes <= 5242880),
  enviado_por    uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  -- Soft-delete (RN20/ADR-0007): removível pelo autor (dor editável) ou pelo admin
  deleted_at     timestamptz,
  deleted_by     uuid references auth.users(id)
);

-- RLS enable+force (RS-D1 — deny-by-default)
alter table public.anexo_dor enable row level security;
alter table public.anexo_dor force  row level security;

-- Guarda de quantidade: máx 5 anexos vivos por dor (RS-A2/security §3.3)
-- Implementada como trigger BEFORE INSERT
create or replace function public._anexo_dor_check_qtd()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  select count(*) into v_n
    from public.anexo_dor
   where dor_id = new.dor_id and deleted_at is null;
  if v_n >= 5 then
    raise exception 'limite de 5 anexos por dor excedido';
  end if;
  return new;
end; $$;

create trigger anexo_dor_check_qtd before insert on public.anexo_dor
  for each row execute function public._anexo_dor_check_qtd();

-- SELECT: anon + authenticated veem só anexos de dores publicadas (vitrine — RN17/RS-A4/RS-A5)
create policy anexo_select_publica on public.anexo_dor for select to anon, authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.dor d
      where d.id = dor_id and d.status_dor = 'publicada' and d.deleted_at is null
    )
  );

-- SELECT: autor vê seus próprios anexos em qualquer estado (RN18)
create policy anexo_select_autor on public.anexo_dor for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.dor d
      where d.id = dor_id and d.autor_id = (select auth.uid())
    )
  );

-- SELECT: admin vê tudo (para moderar/remover impróprio — RN14)
create policy anexo_select_admin on public.anexo_dor for select to authenticated
  using ((select public.is_admin()));

-- INSERT: autor verificado, dor viva e pertencente a ele (gate de verificação — RN19)
create policy anexo_insert_autor on public.anexo_dor for insert to authenticated
  with check (
    enviado_por = (select auth.uid())
    and (select public.esta_verificado())
    and exists (
      select 1 from public.dor d
      where d.id = dor_id
        and d.autor_id = (select auth.uid())
        and d.deleted_at is null
    )
  );

-- UPDATE: não permitido diretamente (soft-delete via deleted_at)
-- DELETE (lógico): autor (dor editável) ou admin
create policy anexo_delete_autor on public.anexo_dor for delete to authenticated
  using (
    exists (
      select 1 from public.dor d
      where d.id = dor_id
        and d.autor_id = (select auth.uid())
        and d.status_dor in ('rascunho', 'rejeitada')
        and d.deleted_at is null
    )
  );

create policy anexo_delete_admin on public.anexo_dor for delete to authenticated
  using ((select public.is_admin()));

-- Trigger de auditoria (RN20)
create trigger zzz_audit after insert or update or delete on public.anexo_dor
  for each row execute function audit.gravar_versao();
