-- Migração 0019 — bucket privado 'dor-anexos' + Storage policies (feature 004)
-- security.md §3 (decisão: privado-até-publicar + allowlist); architecture.md §3; spec RN14/RN15/CA16.
-- Depende de: 0017 (anexo_dor), 0015 (dor), security.md §3 (aprovado: bucket privado + RLS por path).
--
-- GUARD PGlite: o schema 'storage' NÃO existe no PGlite.
-- Todo o DDL que depende de storage.* fica dentro do bloco DO abaixo e é NO-OP no PGlite.
-- No Supabase real o schema 'storage' existe e o bloco executa normalmente.
-- O comportamento de Storage (acesso ao objeto) é validado pelo smoke real (Onda 4 / Maestro).

do $guard$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    -- ── Bucket privado dor-anexos ─────────────────────────────────────────
    -- Bucket privado (não-público): acesso mediado por Storage RLS por path (RS-A4/RS-A5).
    -- O grant de "público" para dores publicadas é via policy de path, não bucket público puro (VETO-A).
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values (
        'dor-anexos',
        'dor-anexos',
        false,  -- PRIVADO: nunca público puro (security.md VETO-A)
        5242880, -- 5 MB (security §3.3)
        array[
          'image/png',
          'image/jpeg',
          'image/webp',
          'application/pdf',
          'text/csv',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ]
      )
      on conflict (id) do update set
        public            = excluded.public,
        file_size_limit   = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
    $sql$;

    -- ── Storage RLS policies por path (espelha visibilidade da dor pai) ───
    -- Path convention: dor/{dor_id}/{uuid}-{nome}

    -- SELECT: anon + authenticated podem ler objetos de DORES PUBLICADAS (vitrine — CA16/RN17/RS-A5)
    execute $sql$
      create policy "storage_dor_select_publica"
        on storage.objects for select to anon, authenticated
        using (
          bucket_id = 'dor-anexos'
          and exists (
            select 1 from public.anexo_dor a
            join public.dor d on d.id = a.dor_id
            where a.storage_path = (storage.objects.bucket_id || '/' || storage.objects.name)
               or a.storage_path = storage.objects.name
            and d.status_dor = 'publicada'
            and d.deleted_at is null
            and a.deleted_at is null
          )
        );
    $sql$;

    -- SELECT: autor lê seus próprios objetos em qualquer estado (privado-até-publicar — RS-A4)
    execute $sql$
      create policy "storage_dor_select_autor"
        on storage.objects for select to authenticated
        using (
          bucket_id = 'dor-anexos'
          and exists (
            select 1 from public.anexo_dor a
            join public.dor d on d.id = a.dor_id
            where (a.storage_path = (storage.objects.bucket_id || '/' || storage.objects.name)
                or a.storage_path = storage.objects.name)
              and d.autor_id = auth.uid()
              and a.deleted_at is null
          )
        );
    $sql$;

    -- SELECT: admin lê tudo (para moderar/remover impróprio)
    execute $sql$
      create policy "storage_dor_select_admin"
        on storage.objects for select to authenticated
        using (
          bucket_id = 'dor-anexos'
          and (select public.is_admin())
        );
    $sql$;

    -- INSERT: autor verificado faz upload (allowlist e tamanho já no bucket; RS-A2)
    execute $sql$
      create policy "storage_dor_insert_autor"
        on storage.objects for insert to authenticated
        with check (
          bucket_id = 'dor-anexos'
          and (select public.esta_verificado())
          and name like 'dor/%'
        );
    $sql$;

    -- DELETE: admin pode deletar objetos impróprios
    execute $sql$
      create policy "storage_dor_delete_admin"
        on storage.objects for delete to authenticated
        using (
          bucket_id = 'dor-anexos'
          and (select public.is_admin())
        );
    $sql$;

  end if;
end
$guard$;
