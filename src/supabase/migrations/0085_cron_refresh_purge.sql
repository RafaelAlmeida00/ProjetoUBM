-- Migração 0085 — Cron de refresh diário das MVs analytics + purge do log (Onda 3)
-- spec 008: CA23a · RN6 · RS-B7/D2
-- Depende de: 0080 (mv_overview), 0081 (mv_rankings_publico), 0082 (mv_rankings_empresa).
--
-- DESIGN:
--   3 refreshes CONCURRENTLY escalonados fora de pico (04:00-04:25 UTC):
--     mv_overview         → 04:00 UTC
--     mv_rankings_publico → 04:15 UTC
--     mv_rankings_empresa → 04:25 UTC
--   purge_cron_log        → 04:40 UTC (APÓS os refreshes — anti-acúmulo >30 dias)
--
--   Guard pg_cron (perigo #2): bloco do $cron_guard$ é no-op se extensão ausente
--   (PGlite não tem pg_cron). Espelha exatamente o padrão de 0071_expiracao_pg_cron.sql.
--
-- DOWN (rollback — se pg_cron disponível):
--   select cron.unschedule('analytics-refresh-overview');
--   select cron.unschedule('analytics-refresh-rankings-publico');
--   select cron.unschedule('analytics-refresh-rankings-empresa');
--   select cron.unschedule('analytics-purge-cron-log');

-- ── pg_cron: agendamentos diários (guard de extensão — no-op no PGlite) ──────
do $cron_guard$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then

    -- 1) mv_overview — 04:00 UTC
    perform cron.schedule(
      'analytics-refresh-overview',
      '0 4 * * *',
      $job$ refresh materialized view concurrently analytics.mv_overview; $job$
    );

    -- 2) mv_rankings_publico — 04:15 UTC (escalonado +15 min)
    perform cron.schedule(
      'analytics-refresh-rankings-publico',
      '15 4 * * *',
      $job$ refresh materialized view concurrently analytics.mv_rankings_publico; $job$
    );

    -- 3) mv_rankings_empresa — 04:25 UTC (escalonado +25 min)
    perform cron.schedule(
      'analytics-refresh-rankings-empresa',
      '25 4 * * *',
      $job$ refresh materialized view concurrently analytics.mv_rankings_empresa; $job$
    );

    -- 4) purge_cron_log — 04:40 UTC (APÓS todos os refreshes — RS-D2)
    perform cron.schedule(
      'analytics-purge-cron-log',
      '40 4 * * *',
      $job$ delete from cron.job_run_details where end_time < now() - interval '30 days'; $job$
    );

  end if;
exception when others then null;  -- fail-soft: se extensão presente mas schedule falha
end; $cron_guard$;
