-- Migração 0038 — hardening: revoke execute de PUBLIC + re-grant mínimo (feature 005)
-- architecture.md §7; tasks.md T-O1.9; security.md RS11, RS15. Espelha 0023.
-- RN27 (herança/hardening).
--
-- Motivo: CREATE FUNCTION concede EXECUTE a PUBLIC por padrão → anon poderia chamar as RPCs
--   (mitigado por gates internos, mas defesa-em-profundidade exige revoke). Re-grant pela matriz:
--   - mutação (gate interno is_admin/host/self) → authenticated
--   - helpers de escopo + vitrine pública → anon + authenticated
--   - trigger-fns → NENHUM grant (invocadas pelo runtime)

-- ── REVOKE execute de PUBLIC (todas as funções novas da 005) ─────────────────
revoke execute on function public.indicar_se(uuid, public.papel_pretendido, text)        from public;
revoke execute on function public.retirar_indicacao(uuid)                                from public;
revoke execute on function public.fechar_equipe(uuid, uuid, jsonb)                       from public;
revoke execute on function public.avancar_projeto(uuid)                                  from public;
revoke execute on function public.trocar_host(uuid, uuid)                                from public;
revoke execute on function public.override_transicao(uuid, public.status_projeto, text)  from public;
revoke execute on function public.restore_record(text, uuid)                             from public;
revoke execute on function public.erasure_titular(uuid)                                  from public;
revoke execute on function public.is_project_host(uuid)                                  from public;
revoke execute on function public.is_project_coordinator(uuid)                           from public;
revoke execute on function public.is_team_member(uuid)                                   from public;
revoke execute on function public.is_dor_course_coordinator(uuid)                        from public;
revoke execute on function public.equipe_publica(uuid)                                   from public;
revoke execute on function public.timeline_publica(uuid)                                 from public;
revoke execute on function public._dor_abre_projeto()                                    from public;
revoke execute on function public._projeto_abre_evento()                                 from public;
revoke execute on function public._projeto_guarda_transicao()                            from public;
revoke execute on function public._projeto_notificar_abertura()                          from public;
revoke execute on function public._membro_equipe_notificar()                             from public;
revoke execute on function public._projeto_notificar()                                   from public;

-- ── RE-GRANT mínimo ──────────────────────────────────────────────────────────
-- Mutação (gate interno) → authenticated
grant execute on function public.indicar_se(uuid, public.papel_pretendido, text)         to authenticated;
grant execute on function public.retirar_indicacao(uuid)                                 to authenticated;
grant execute on function public.fechar_equipe(uuid, uuid, jsonb)                        to authenticated;
grant execute on function public.avancar_projeto(uuid)                                   to authenticated;
grant execute on function public.trocar_host(uuid, uuid)                                 to authenticated;
grant execute on function public.override_transicao(uuid, public.status_projeto, text)   to authenticated;
grant execute on function public.restore_record(text, uuid)                              to authenticated;
grant execute on function public.erasure_titular(uuid)                                   to authenticated;
-- Helpers de escopo + vitrine pública → anon + authenticated
grant execute on function public.is_project_host(uuid)                                   to anon, authenticated;
grant execute on function public.is_project_coordinator(uuid)                            to anon, authenticated;
grant execute on function public.is_team_member(uuid)                                    to anon, authenticated;
grant execute on function public.is_dor_course_coordinator(uuid)                         to anon, authenticated;
grant execute on function public.equipe_publica(uuid)                                    to anon, authenticated;
grant execute on function public.timeline_publica(uuid)                                  to anon, authenticated;
-- trigger-fns: NENHUM grant (invocadas pelo runtime do Postgres)

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN: re-grant execute a public nas funções acima (reverte o hardening).  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
