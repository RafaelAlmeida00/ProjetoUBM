-- Migração 0023 — hardening: revoke execute de PUBLIC em todas as funções SECURITY DEFINER (feature 004)
-- security.md §4.2 (princípio do mínimo privilégio); spec §10 RS-H1/RS-H2/RS-H4.
-- Depende de: 0004, 0006, 0007, 0008, 0009, 0010, 0011, 0012, 0013, 0014, 0018, 0020, 0021.
--
-- OBJETIVO: remover o grant implícito/explícito de EXECUTE para o role especial PUBLIC
-- em TODAS as funções SECURITY DEFINER do schema public.
-- Depois re-estabelece o mínimo necessário por função (sem nada a mais — YAGNI/security §4.2).
--
-- NOTE: Em Postgres, criar uma função com `CREATE OR REPLACE FUNCTION` sem `REVOKE`
-- mantém o grant padrão para PUBLIC (execute) herdado do schema `public`.
-- Esta migração corrige isso explicitamente para cada função.
--
-- MATRIZ DE GRANTS (security.md §4.2):
--   anon + authenticated : is_admin, has_role, is_course_coordinator, is_company_rep, esta_verificado,
--                          buscar_empresa, verificar_conta
--   authenticated only   : assumir_papel, emitir_token_verificacao, ler_audit,
--                          obter_ou_criar_empresa, listar_duplicatas_possiveis,
--                          restore_record, erasure_titular,
--                          propor_backfill_empresas, aplicar_backfill_grupo, aplicar_backfill_proposal,
--                          merge_empresa, desfazer_merge,
--                          submeter_dor, submeter_dor_landing, moderar_dor, remover_anexo_admin,
--                          dor_publicavel, backfill_proposal_para_dor
--   service_role only    : criar_notificacao, quer_email
--   supabase_auth_admin  : custom_access_token_hook
--   nenhum (trigger fns) : handle_new_user, gravar_versao, _dor_guarda_transicao,
--                          _perfil_verificacao_destrava_dor, _dor_notificar,
--                          _anexo_dor_check_qtd, is_email_corporativo
--
-- NOTA sobre is_email_corporativo: helper interno chamado por submeter_dor_landing (SECURITY DEFINER),
-- não precisa de grant direto — chamado dentro do contexto da função.

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 1 — REVOKE EXECUTE FROM PUBLIC em todas as funções SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════════════════

-- [0004] helpers de autorização e hook
revoke execute on function public.custom_access_token_hook(jsonb) from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.has_role(public.app_role) from public;
revoke execute on function public.is_course_coordinator(uuid) from public;
revoke execute on function public.is_company_rep(uuid) from public;
revoke execute on function public.esta_verificado() from public;
revoke execute on function public.handle_new_user() from public;

-- [0006] verificação de conta
revoke execute on function public.emitir_token_verificacao() from public;
revoke execute on function public.verificar_conta(text) from public;

-- [0007] onboarding / email corporativo
revoke execute on function public.is_email_corporativo(text) from public;
revoke execute on function public.assumir_papel(public.app_role) from public;

-- [0008] auditoria
-- audit.gravar_versao() está no schema audit, fora do scope (public); ler_audit está em public
revoke execute on function public.ler_audit(int) from public;

-- [0009]/[0011]/[0020] restore_record (redefinida incrementalmente; last-def é a que conta)
revoke execute on function public.restore_record(text, uuid) from public;

-- [0010]/[0020] notificação + email
revoke execute on function public.criar_notificacao(uuid, public.tipo_notificacao, jsonb, text, text, text) from public;
revoke execute on function public.quer_email(uuid, public.tipo_notificacao) from public;
revoke execute on function public.erasure_titular(uuid) from public;

-- [0011] normalizar_empresa — usada em generated column (nome_normalizado); gerada column
-- é avaliada com os privilégios do caller em PGlite (não SECURITY DEFINER context).
-- Por isso mantemos o revoke de PUBLIC e re-grant explícito para anon + authenticated.
revoke execute on function public.normalizar_empresa(text) from public;

-- [0012] busca e criação de empresa
revoke execute on function public.buscar_empresa(text) from public;
revoke execute on function public.obter_ou_criar_empresa(text) from public;
revoke execute on function public.listar_duplicatas_possiveis() from public;

-- [0013] merge/desfazer
revoke execute on function public.merge_empresa(uuid, uuid) from public;
revoke execute on function public.desfazer_merge(uuid) from public;

-- [0014] backfill empresa
revoke execute on function public.propor_backfill_empresas() from public;
revoke execute on function public.aplicar_backfill_grupo(uuid) from public;
revoke execute on function public.aplicar_backfill_proposal(uuid, uuid) from public;

-- [0017] trigger de quota de anexos (trigger fn — nenhum grant necessário)
revoke execute on function public._anexo_dor_check_qtd() from public;

-- [0018] transições A1 / RPCs de dor
revoke execute on function public.dor_publicavel(uuid) from public;
revoke execute on function public._dor_guarda_transicao() from public;
revoke execute on function public.submeter_dor(uuid) from public;
revoke execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz) from public;
revoke execute on function public.moderar_dor(uuid, text, text) from public;
revoke execute on function public._perfil_verificacao_destrava_dor() from public;
revoke execute on function public.remover_anexo_admin(uuid) from public;

-- [0020] notificação da dor + erasure redefinida
revoke execute on function public._dor_notificar() from public;
-- restore_record e erasure_titular já revogados acima (0009/0010 sets)

-- [0021] backfill proposal → dor
revoke execute on function public.backfill_proposal_para_dor() from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 2 — Re-GRANT mínimo por função (security.md §4.2 matriz)
-- ═══════════════════════════════════════════════════════════════════════════

-- normalizar_empresa: usada em generated column (nome_normalizado) — caller precisa de EXECUTE
-- em PGlite. Concede a anon+authenticated para que INSERT/UPDATE em empresa funcione.
grant execute on function public.normalizar_empresa(text) to anon, authenticated;

-- anon + authenticated (helpers de auth usados em RLS policies)
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.has_role(public.app_role) to anon, authenticated;
grant execute on function public.is_course_coordinator(uuid) to anon, authenticated;
grant execute on function public.is_company_rep(uuid) to anon, authenticated;
grant execute on function public.esta_verificado() to anon, authenticated;

-- anon + authenticated (RPCs de leitura pública)
grant execute on function public.buscar_empresa(text) to anon, authenticated;
grant execute on function public.verificar_conta(text) to anon, authenticated;

-- authenticated only
grant execute on function public.assumir_papel(public.app_role) to authenticated;
grant execute on function public.emitir_token_verificacao() to authenticated;
grant execute on function public.ler_audit(int) to authenticated;
grant execute on function public.obter_ou_criar_empresa(text) to authenticated;
grant execute on function public.listar_duplicatas_possiveis() to authenticated;
grant execute on function public.restore_record(text, uuid) to authenticated;
grant execute on function public.erasure_titular(uuid) to authenticated;
grant execute on function public.propor_backfill_empresas() to authenticated;
grant execute on function public.aplicar_backfill_grupo(uuid) to authenticated;
grant execute on function public.aplicar_backfill_proposal(uuid, uuid) to authenticated;
grant execute on function public.merge_empresa(uuid, uuid) to authenticated;
grant execute on function public.desfazer_merge(uuid) to authenticated;
grant execute on function public.submeter_dor(uuid) to authenticated;
grant execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz) to authenticated;
grant execute on function public.moderar_dor(uuid, text, text) to authenticated;
grant execute on function public.remover_anexo_admin(uuid) to authenticated;
grant execute on function public.dor_publicavel(uuid) to authenticated;
grant execute on function public.backfill_proposal_para_dor() to authenticated;

-- service_role only (funções internas de outbox/notificação — RS-H2)
grant execute on function public.criar_notificacao(uuid, public.tipo_notificacao, jsonb, text, text, text) to service_role;
grant execute on function public.quer_email(uuid, public.tipo_notificacao) to service_role;

-- supabase_auth_admin (custom JWT hook — só o auth service pode chamar)
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Trigger functions, helper interno (is_email_corporativo, normalizar_empresa, handle_new_user,
-- _dor_guarda_transicao, _perfil_verificacao_destrava_dor, _dor_notificar, _anexo_dor_check_qtd):
-- NÃO recebem grant de execute para nenhum role de aplicação.
-- São chamadas pelo runtime do Postgres via gatilho ou por outras funções SECURITY DEFINER.
-- Nenhum grant = deny para todos.
