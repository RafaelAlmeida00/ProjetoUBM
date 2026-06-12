-- Migração 0016 — tabela public.dor_curso (N:N cursos sugeridos para a dor) (feature 004)
-- architecture.md §2.3; spec §7 CA5; security.md RS-D1/RS-D2.
-- Depende de: 0015 (dor), 0001 (enum curso_ubm), 0008 (audit).
-- Reusa enum curso_ubm da 0001 (inclui nao_sei) — fonte fechada única (RN8).

create table public.dor_curso (
  dor_id  uuid not null references public.dor(id) on delete cascade,
  curso   public.curso_ubm not null,
  -- PK composta: impede curso duplicado na mesma dor (CA5/RN8)
  primary key (dor_id, curso)
);

-- RLS enable+force (RS-D1 — deny-by-default)
alter table public.dor_curso enable row level security;
alter table public.dor_curso force  row level security;

-- SELECT: espelha a visibilidade da dor pai (architecture §2.7)
-- Anon + authenticated veem cursos de dores publicadas (vitrine — CA17/RN17)
create policy dor_curso_select_publica on public.dor_curso for select to anon, authenticated
  using (
    exists (
      select 1 from public.dor d
      where d.id = dor_id and d.status_dor = 'publicada' and d.deleted_at is null
    )
  );

-- Autor vê os cursos das PRÓPRIAS dores em qualquer estado (CA18/RN18)
create policy dor_curso_select_autor on public.dor_curso for select to authenticated
  using (
    exists (
      select 1 from public.dor d
      where d.id = dor_id and d.autor_id = (select auth.uid())
    )
  );

-- Admin vê tudo (para moderar/corrigir — RN18)
create policy dor_curso_select_admin on public.dor_curso for select to authenticated
  using ((select public.is_admin()));

-- INSERT: autor dono da dor pode associar cursos (dor deve ser editável — rascunho/rejeitada ou via RPC)
-- O gate fino (estado da dor) é imposto pela RPC submeter_dor; aqui o gate mínimo é autoria.
create policy dor_curso_insert_autor on public.dor_curso for insert to authenticated
  with check (
    exists (
      select 1 from public.dor d
      where d.id = dor_id and d.autor_id = (select auth.uid()) and d.deleted_at is null
    )
    and (select public.esta_verificado())
  );

-- INSERT via service_role (RPCs SECURITY DEFINER — submeter_dor_landing, backfill)
-- service_role bypassa RLS, portanto nenhuma policy explícita necessária para ele.

-- DELETE: autor dono (dor editável) ou admin (auditado)
create policy dor_curso_delete_autor on public.dor_curso for delete to authenticated
  using (
    exists (
      select 1 from public.dor d
      where d.id = dor_id
        and d.autor_id = (select auth.uid())
        and d.status_dor in ('rascunho', 'rejeitada')
        and d.deleted_at is null
    )
  );

create policy dor_curso_delete_admin on public.dor_curso for delete to authenticated
  using ((select public.is_admin()));

-- Trigger de auditoria (RN20)
create trigger zzz_audit after insert or update or delete on public.dor_curso
  for each row execute function audit.gravar_versao();
