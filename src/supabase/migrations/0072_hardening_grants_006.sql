-- 0072 — Hardening de grants da feature 006 (revoke public/anon + re-grant mínimo)
--
-- Lição 0063: CREATE OR REPLACE FUNCTION reseta os grants para PUBLIC no Supabase hospedado.
-- Esta migração aplica o padrão 0038/0050 para as RPCs novas da 006:
--   - revoke all from public  (remove grant default ao criar)
--   - revoke execute from anon (explícito — default privileges do Supabase concedem anon)
--   - grant execute to authenticated  (RPCs de usuário)
--   - confirmar_assinatura + expirar_propostas: service_role também (webhook/job interno)
--   - _projeto_guarda_transicao: trigger fn — nenhum grant de app role
--
-- Também re-afirma os grants das RPCs recriadas (0068/0069) que podem ter resetado.
--
-- Depende de: 0068 (RPCs da 006), 0069 (guarda atores reais), 0071 (expirar_propostas)
--
-- Rollback: re-grant execute to public nas funções abaixo.

-- ── enviar_proposta (host envia; authenticated) ──────────────────────────────
revoke all     on function public.enviar_proposta(uuid, text, public.origem_assinatura) from public;
revoke execute on function public.enviar_proposta(uuid, text, public.origem_assinatura) from anon;
grant  execute on function public.enviar_proposta(uuid, text, public.origem_assinatura) to authenticated;

-- ── confirmar_assinatura (webhook service_role + upload authenticated) ────────
revoke all     on function public.confirmar_assinatura(public.origem_assinatura, text, text, jsonb) from public;
revoke execute on function public.confirmar_assinatura(public.origem_assinatura, text, text, jsonb) from anon;
grant  execute on function public.confirmar_assinatura(public.origem_assinatura, text, text, jsonb) to authenticated, service_role;

-- ── contrapropor_proposta (representante; authenticated) ─────────────────────
revoke all     on function public.contrapropor_proposta(uuid, text) from public;
revoke execute on function public.contrapropor_proposta(uuid, text) from anon;
grant  execute on function public.contrapropor_proposta(uuid, text) to authenticated;

-- ── iniciar_execucao (host; authenticated) ───────────────────────────────────
revoke all     on function public.iniciar_execucao(uuid) from public;
revoke execute on function public.iniciar_execucao(uuid) from anon;
grant  execute on function public.iniciar_execucao(uuid) to authenticated;

-- ── finalizar_projeto (host; authenticated) ──────────────────────────────────
revoke all     on function public.finalizar_projeto(uuid) from public;
revoke execute on function public.finalizar_projeto(uuid) from anon;
grant  execute on function public.finalizar_projeto(uuid) to authenticated;

-- ── expirar_propostas (job interno; service_role + authenticated) ─────────────
revoke all     on function public.expirar_propostas() from public;
revoke execute on function public.expirar_propostas() from anon;
grant  execute on function public.expirar_propostas() to authenticated, service_role;

-- ── _projeto_guarda_transicao (trigger fn — nenhum grant de app role) ─────────
-- Recriada na 0069; re-afirma que anon/authenticated não executam diretamente.
revoke all on function public._projeto_guarda_transicao() from public, anon, authenticated;

-- ── Re-afirma grants das RPCs da 005 recriadas pela 0069 (CREATE OR REPLACE) ─
-- A 0069 recria _projeto_guarda_transicao; as demais RPCs da 0060 não foram recriadas,
-- mas re-afirmamos o padrão das trigger fns da 005 que ainda podem ter grant default:
revoke all on function public._projeto_abre_evento()          from public, anon, authenticated;
revoke all on function public._projeto_notificar_abertura()   from public, anon, authenticated;
revoke all on function public._membro_equipe_notificar()      from public, anon, authenticated;
revoke all on function public._projeto_notificar()            from public, anon, authenticated;
