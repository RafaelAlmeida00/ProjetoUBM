-- Migração 0070 — bucket privado 'propostas' + Storage policies (feature 006)
-- spec: RN5/RN18/CA18 · security RS14/veto V3 · arch §4.6
-- Depende de: 0065 (documento_proposta), 0004 (is_admin/is_company_rep),
--             0031 (is_project_coordinator)
--
-- GUARD PGlite: o schema 'storage' NÃO existe no PGlite.
-- Todo o DDL que depende de storage.* fica dentro do bloco DO abaixo e é NO-OP no PGlite.
-- No Supabase real o schema 'storage' existe e o bloco executa normalmente.
-- O comportamento de Storage (acesso ao objeto) é validado pelo smoke real (T6.2 / Onda 6).
--
-- DIFERENÇA CRÍTICA em relação ao 'dor-anexos' (0019):
--   - dor-anexos tem policy SELECT pública (para vitrine/anon) → PROIBIDO aqui (RS14/veto V3).
--   - 'propostas' é 100% privado: NENHUMA policy 'to anon' e NENHUMA SELECT mais ampla que
--     a visibilidade do documento_proposta (host+coordenação+representante+admin).
--   - Lição "RLS mais amplo vaza": policy de path deve filtrar escopo explícito.
--
-- Storage validado no smoke real (Onda 6); não há teste PGlite (schema storage ausente).
-- Rollback:
--   drop policy if exists "storage_propostas_delete_admin" on storage.objects;
--   drop policy if exists "storage_propostas_insert_rep_ou_admin" on storage.objects;
--   drop policy if exists "storage_propostas_insert_host" on storage.objects;
--   drop policy if exists "storage_propostas_select_restrito" on storage.objects;
--   delete from storage.buckets where id = 'propostas' and not exists (
--     select 1 from storage.objects where bucket_id = 'propostas'
--   );

do $guard$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then

    -- ── Bucket PRIVADO 'propostas' ────────────────────────────────────────────
    -- public=false: NUNCA bucket público (RS14/veto V3/arch §4.6).
    -- Allowlist: só application/pdf (C8/RS12).
    -- Limite de tamanho: 10 MB (compatível com free tier e documentos jurídicos — arch §4.6).
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values (
        'propostas',
        'propostas',
        false,     -- PRIVADO: nunca público (RS14 — ao contrário de dor-anexos)
        10485760,  -- 10 MB (arch §4.6 / RS12)
        array['application/pdf']  -- APENAS PDF (C8/RS12)
      )
      on conflict (id) do update set
        public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
    $sql$;

    -- ── Storage RLS policies por path (espelha visibilidade do documento_proposta) ──
    -- Path convention: {projeto_id}/{uuid}-(original|assinado).pdf
    -- Visibilidade: host/coordenação do projeto + representante da empresa + admin.
    -- NENHUMA policy 'to anon' → negado (RS14/veto V3/RN18/CA18).

    -- SELECT: host + coordenadores do projeto + representante da empresa + admin
    -- Espelha EXATAMENTE a policy 'documento_select_restrito' de 0065.
    -- Extrai projeto_id do path (primeiro segmento antes de '/').
    execute $sql$
      create policy "storage_propostas_select_restrito"
        on storage.objects for select to authenticated
        using (
          bucket_id = 'propostas'
          and (
            (select public.is_admin())
            or exists (
              select 1 from public.documento_proposta d
               where (
                      d.storage_path_original = (storage.objects.bucket_id || '/' || storage.objects.name)
                   or d.storage_path_original = storage.objects.name
                   or d.storage_path_assinado = (storage.objects.bucket_id || '/' || storage.objects.name)
                   or d.storage_path_assinado = storage.objects.name
                 )
               and d.deleted_at is null
               and (
                 (select public.is_company_rep(d.empresa_id))
                 or (select public.is_project_coordinator(d.projeto_id))
               )
            )
          )
        );
    $sql$;

    -- INSERT pelo host verificado (Caminho A: envia PDF original)
    -- Path: propostas/{projeto_id}/{uuid}-original.pdf
    execute $sql$
      create policy "storage_propostas_insert_host"
        on storage.objects for insert to authenticated
        with check (
          bucket_id = 'propostas'
          and (select public.esta_verificado())
          -- Path = {projeto_id}/{doc}-original.pdf → 1º segmento é o projeto_id (sem prefixo de bucket).
          -- Guard de formato uuid antes do cast (path malformado → deny limpo, sem erro de cast).
          and storage.objects.name ~ '^[0-9a-fA-F-]{36}/'
          and (select public.is_project_host( (split_part(storage.objects.name, '/', 1))::uuid ))
        );
    $sql$;

    -- INSERT pelo representante ou admin (Caminho B: upload do PDF assinado; CA26: admin override)
    -- Mesma condição de path; AUTZ real é da RPC confirmar_assinatura (SECURITY DEFINER).
    execute $sql$
      create policy "storage_propostas_insert_rep_ou_admin"
        on storage.objects for insert to authenticated
        with check (
          bucket_id = 'propostas'
          and (
            (select public.is_admin())
            or exists (
              select 1 from public.documento_proposta d
               where d.deleted_at is null
                 -- Escopo ao documento/projeto DESTE path (não a qualquer documento da plataforma):
                 and (
                      storage.objects.name = d.storage_path_original
                   or storage.objects.name = d.storage_path_assinado
                   or storage.objects.name like (d.projeto_id::text || '/%')
                 )
                 and (select public.is_company_rep(d.empresa_id))
            )
          )
        );
    $sql$;

    -- DELETE: admin pode remover (contingência / erasure LGPD futura — RS18/009)
    execute $sql$
      create policy "storage_propostas_delete_admin"
        on storage.objects for delete to authenticated
        using (
          bucket_id = 'propostas'
          and (select public.is_admin())
        );
    $sql$;

  end if;
end
$guard$;
