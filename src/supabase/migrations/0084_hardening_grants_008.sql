-- Migração 0084 — Re-hardening de GRANTS para RPCs analytics (Onda 3)
-- spec 008: CA22/CA23 · RS-C1/E1/E2 · veto-seg #11/#12
-- Depende de: 0083 (get_overview, get_rankings_publicos).
--
-- INVARIANTES:
--   CA22/veto #12: get_overview → NUNCA anon; só authenticated (gate interno filtra papel).
--   CA23/veto #11: get_rankings_publicos → anon E authenticated (porta pública).
--   revoke anon EXPLÍCITO: CREATE OR REPLACE reseta grants e o Supabase hospedado
--   auto-concede anon via default privileges em novas funções do schema public
--   (memória: grant-reset-create-or-replace + supabase-anon-default-privileges).
--   Idempotente: revoke de role que já não tem é no-op em Postgres.
--
-- DOWN (rollback):
--   -- Sem rollback útil: re-rodar 0083 retorna ao estado pré-hardening.

-- ── get_overview: authenticated-only (NUNCA anon) ───────────────────────────
revoke all     on function public.get_overview() from public;
revoke execute on function public.get_overview() from anon;        -- explícito (default privileges hospedado)
grant  execute on function public.get_overview() to authenticated;

-- ── get_rankings_publicos: anon + authenticated (porta pública) ──────────────
revoke all     on function public.get_rankings_publicos() from public;
grant  execute on function public.get_rankings_publicos() to anon, authenticated;
