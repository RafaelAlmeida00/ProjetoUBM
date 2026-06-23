-- Migração 0078 — schema privado analytics (fora da API PostgREST)
-- spec 008: CA19 · RN13 · RS-B1 · veto-seg #1
-- NÃO adicionar 'analytics' em Exposed schemas (config do projeto — Camada B).
-- Depende de: nenhuma (schema novo, independente).
--
-- DOWN (rollback):
--   drop schema analytics cascade;

create schema if not exists analytics;

-- Garante que anon e authenticated NÃO navegam o schema (RS-B1).
-- 'public' herdaria via pg_catalog; revoke de public cobre todos os roles não listados.
revoke all on schema analytics from public;
revoke all on schema analytics from anon;
revoke all on schema analytics from authenticated;
