-- Migração 0028 — G4 fixes de segurança (feature 004)
-- Achados do G4 REVIEW corrigidos antes do DELIVER.
-- Refs: cybersecurity.md §G4 achados (1)(2)(3)/(4); review-senior.md C1/I2/I4.
-- NÃO toca migrações/funções de outras features (paleta=007, projeto/equipe=005).
-- Depende de: 0019 (storage policies), 0018 (submeter_dor_landing), 0023 (hardening base).
--
-- FIXES incluídos:
--   C1  — storage_dor_select_publica: parênteses explícitos no OR de path + guarda em todos os disjuntos
--   I2  — storage_dor_select_autor: adiciona d.deleted_at is null (consistente com 0015/0017)
--   I4  — submeter_dor_landing: adiciona guarda server-side de e-mail corporativo (RN23/CA23)
--   RS-H1 HARDENING anon — revoke execute from anon explícito em todas as RPCs admin/privadas
--         (Supabase auto-concede EXECUTE a anon em funções novas; revoke from public nao basta)
--
-- IDEMPOTÊNCIA: drop policy if exists + create policy (storage dentro do guard if exists storage);
--               create or replace function (re-definição idempotente); revoke/grant idempotentes.

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX C1 + I2 — Storage policies (dentro do guard: NO-OP no PGlite, executa no Supabase real)
-- ═══════════════════════════════════════════════════════════════════════════════
do $guard$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then

    -- ── C1: recria storage_dor_select_publica com parênteses explícitos ──────
    -- PROBLEMA (0019): OR/AND sem parênteses → AND liga mais que OR →
    --   `path = bucket||name  OR  (path = name AND status='publicada' AND ...)`
    --   O primeiro disjunto não tem guarda de estado/deleted_at → leak de PII latente (VETO-A/VETO-2).
    -- CORREÇÃO: envolve o OR de path entre parênteses; os filtros de estado ficam FORA dos disjuntos,
    --   aplicando-se a AMBOS. Adicionalmente valida a.enviado_por para consistência interna.
    execute $sql$
      drop policy if exists "storage_dor_select_publica" on storage.objects;
      create policy "storage_dor_select_publica"
        on storage.objects for select to anon, authenticated
        using (
          bucket_id = 'dor-anexos'
          and exists (
            select 1
              from public.anexo_dor a
              join public.dor d on d.id = a.dor_id
             where (
                     a.storage_path = (storage.objects.bucket_id || '/' || storage.objects.name)
                  or a.storage_path = storage.objects.name
                   )
               and d.status_dor = 'publicada'
               and d.deleted_at is null
               and a.deleted_at is null
          )
        );
    $sql$;

    -- ── I2: recria storage_dor_select_autor adicionando d.deleted_at is null ─
    -- PROBLEMA (0019): policy do autor não checava dor.deleted_at → após soft-delete de uma dor,
    --   o autor ainda conseguia ler os anexos daquela dor removida.
    --   Inconsistente com as policies de dor (0015) e anexo_dor (0017) que filtram deleted_at.
    execute $sql$
      drop policy if exists "storage_dor_select_autor" on storage.objects;
      create policy "storage_dor_select_autor"
        on storage.objects for select to authenticated
        using (
          bucket_id = 'dor-anexos'
          and exists (
            select 1
              from public.anexo_dor a
              join public.dor d on d.id = a.dor_id
             where (
                     a.storage_path = (storage.objects.bucket_id || '/' || storage.objects.name)
                  or a.storage_path = storage.objects.name
                   )
               and d.autor_id = auth.uid()
               and d.deleted_at is null
               and a.deleted_at is null
          )
        );
    $sql$;

  end if;
end
$guard$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX I4 — submeter_dor_landing: guarda server-side de e-mail corporativo (RN23/CA23)
-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEMA (0018): a validação de e-mail corporativo (CA23) existia apenas no cliente
--   (ProporSubmitForm.isEmailCorporativo). Um cliente adulterado ou chamada direta via curl
--   conseguia criar uma dor de representante com @gmail.com ou outro provedor genérico —
--   diferente de onboarding_representante (0027) que aplica a guarda server-side.
-- CORREÇÃO: adiciona guarda `is_email_corporativo` ANTES de qualquer escrita no banco.
--   A guarda é inserida após a validação de sessão (v_uid) para manter a ordem de fail-fast.
--   O restante da função é idêntico à 0018 (empresa, consentimento, descrição, INSERT).
-- FIX I3 (cursos perdidos): adiciona p_cursos e insere os cursos DENTRO da função
--   (SECURITY DEFINER bypassa a policy dor_curso_insert_autor que exige esta_verificado() —
--    o autor da landing ainda não verificou; o client loop em dor.ts falhava RLS silenciosamente).
--   create-or-replace não pode ADICIONAR parâmetro → drop da assinatura 8-arg (0018) antes.
drop function if exists public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz);
create or replace function public.submeter_dor_landing(
  p_empresa_id      uuid,
  p_descricao       text,
  p_rep_nome        text,
  p_departamento    text,
  p_cargo           text,
  p_consentimento   boolean,
  p_consent_version text,
  p_consent_at      timestamptz,
  p_cursos          public.curso_ubm[] default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text := (select auth.jwt() ->> 'email');
  v_dor_id uuid;
begin
  -- Guarda 1: sessão obrigatória (NUNCA anon — security §4.3)
  if v_uid is null then
    raise exception 'sessao necessaria (nao pode ser anon)';
  end if;

  -- Guarda 2: e-mail corporativo (RN23/CA23 — alinhado com onboarding_representante 0027)
  -- A autoridade é server-side; a validação client-side é defesa em profundidade adicional.
  if not (select public.is_email_corporativo(v_email)) then
    raise exception 'representante exige e-mail corporativo (RN23/CA23)';
  end if;

  -- Guarda 3: empresa canônica obrigatória
  if p_empresa_id is null then
    raise exception 'empresa_id obrigatorio (RN6)';
  end if;

  -- Guarda 4: consentimento LGPD obrigatório
  if not coalesce(p_consentimento, false) or p_consent_version is null then
    raise exception 'consentimento LGPD obrigatorio (RN7)';
  end if;

  -- Guarda 5: descrição não pode ser vazia
  if p_descricao is null or length(btrim(p_descricao)) = 0 then
    raise exception 'descricao nao pode ser vazia';
  end if;

  -- Cria a dor diretamente em em_moderacao (RN4 — landing)
  -- Bypassa o trigger de transição usando INSERT direto no estado correto.
  insert into public.dor (
    autor_id, empresa_id, status_dor, descricao,
    rep_nome, departamento, cargo,
    consentimento, consent_version, consent_at,
    created_by
  ) values (
    v_uid, p_empresa_id, 'em_moderacao', p_descricao,
    coalesce(p_rep_nome, ''), p_departamento, p_cargo,
    p_consentimento, p_consent_version, p_consent_at,
    v_uid
  ) returning id into v_dor_id;

  -- FIX I3: associa cursos sugeridos DENTRO da função (SECURITY DEFINER bypassa a policy
  --   dor_curso_insert_autor que exige esta_verificado() — autor da landing ainda não verificou).
  --   curso_ubm é enum fechado (cast inválido falha → fail-fast); on conflict evita duplicidade.
  if p_cursos is not null then
    insert into public.dor_curso (dor_id, curso)
    select v_dor_id, c
      from unnest(p_cursos) as c
    on conflict (dor_id, curso) do nothing;
  end if;

  return v_dor_id;
end; $$;

-- Re-grant após create (padrão 0023/0027 — idempotente). Assinatura 9-arg (com p_cursos — FIX I3).
revoke execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[]) from public;
revoke execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[]) from anon;
grant  execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[]) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX RS-H1 HARDENING anon — REVOKE EXECUTE FROM anon explícito
-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEMA: o Supabase auto-concede EXECUTE a `anon` em funções novas (além do PUBLIC padrão).
--   A 0023 fez `revoke from public` (remove o grant implícito de PUBLIC), mas o Supabase
--   também pode ter concedido diretamente a `anon`. O advisor confirmou o gap no hospedado.
--   Estratégia de defesa em profundidade: revoke explícito de anon em TODAS as RPCs que
--   não devem ser acessíveis por usuários não-autenticados.
--
-- MATRIZ (conforme cybersecurity.md §G4 RS-H1 / security.md §4.2):
--   REVOKE anon (mantém authenticated + service_role conforme 0023):
--     assumir_papel, emitir_token_verificacao, ler_audit, listar_duplicatas_possiveis,
--     obter_ou_criar_empresa, merge_empresa, desfazer_merge,
--     propor_backfill_empresas, aplicar_backfill_grupo, aplicar_backfill_proposal,
--     backfill_proposal_para_dor, submeter_dor, submeter_dor_landing,
--     moderar_dor, remover_anexo_admin, dor_publicavel,
--     onboarding_representante, onboarding_aluno,
--     erasure_titular, restore_record,
--     is_email_corporativo (helper interno — não exposto via PostgREST mas revoke defensivo),
--     _anexo_dor_check_qtd, _dor_guarda_transicao, _dor_notificar,
--     _perfil_verificacao_destrava_dor, handle_new_user
--   REVOKE anon E authenticated (só service_role):
--     criar_notificacao, quer_email
--   NÃO revogar de anon (usadas em RLS/landing por anon legítimo):
--     is_admin, has_role, is_course_coordinator, is_company_rep, esta_verificado,
--     buscar_empresa, verificar_conta, normalizar_empresa

-- RPCs authenticated-only (revogar anon — mantém authenticated)
revoke execute on function public.assumir_papel(public.app_role)                                        from anon;
revoke execute on function public.emitir_token_verificacao()                                            from anon;
revoke execute on function public.ler_audit(int)                                                        from anon;
revoke execute on function public.listar_duplicatas_possiveis()                                         from anon;
revoke execute on function public.obter_ou_criar_empresa(text)                                          from anon;
revoke execute on function public.merge_empresa(uuid, uuid)                                             from anon;
revoke execute on function public.desfazer_merge(uuid)                                                  from anon;
revoke execute on function public.propor_backfill_empresas()                                            from anon;
revoke execute on function public.aplicar_backfill_grupo(uuid)                                          from anon;
revoke execute on function public.aplicar_backfill_proposal(uuid, uuid)                                 from anon;
revoke execute on function public.backfill_proposal_para_dor()                                          from anon;
revoke execute on function public.submeter_dor(uuid)                                                    from anon;
-- submeter_dor_landing: já revogado acima no bloco do FIX I4
revoke execute on function public.moderar_dor(uuid, text, text)                                         from anon;
revoke execute on function public.remover_anexo_admin(uuid)                                             from anon;
revoke execute on function public.dor_publicavel(uuid)                                                  from anon;
revoke execute on function public.onboarding_representante(uuid, text, text, text)                      from anon;
revoke execute on function public.onboarding_aluno(text, uuid[])                                        from anon;
revoke execute on function public.erasure_titular(uuid)                                                 from anon;
revoke execute on function public.restore_record(text, uuid)                                            from anon;

-- Helper interno (defensivo — não exposto via PostgREST mas remove canal residual)
revoke execute on function public.is_email_corporativo(text)                                            from anon;

-- Trigger/hook functions (nenhum grant de aplicação; revoke defensivo de anon)
revoke execute on function public._anexo_dor_check_qtd()                                                from anon;
revoke execute on function public._dor_guarda_transicao()                                               from anon;
revoke execute on function public._dor_notificar()                                                      from anon;
revoke execute on function public._perfil_verificacao_destrava_dor()                                    from anon;
revoke execute on function public.handle_new_user()                                                     from anon;

-- RPCs service_role-only (revogar anon E authenticated — já feito em 0023 para public;
-- aqui adicionamos revoke explícito de anon e authenticated para garantir no hospedado)
revoke execute on function public.criar_notificacao(uuid, public.tipo_notificacao, jsonb, text, text, text) from anon;
revoke execute on function public.criar_notificacao(uuid, public.tipo_notificacao, jsonb, text, text, text) from authenticated;
revoke execute on function public.quer_email(uuid, public.tipo_notificacao)                             from anon;
revoke execute on function public.quer_email(uuid, public.tipo_notificacao)                             from authenticated;

-- Re-grant service_role (idem 0023 — idempotente; garante que o revoke acima não apagou o grant de service_role)
grant execute on function public.criar_notificacao(uuid, public.tipo_notificacao, jsonb, text, text, text) to service_role;
grant execute on function public.quer_email(uuid, public.tipo_notificacao)                             to service_role;
