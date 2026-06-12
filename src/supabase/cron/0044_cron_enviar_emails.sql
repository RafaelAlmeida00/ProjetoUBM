-- Cron 0044 — Agendamento pg_cron + pg_net para drenar fila de e-mail a cada minuto
--
-- ATENÇÃO — aplicar SOMENTE após:
--   1. Fazer deploy da edge function `enviar-emails` (Maestro via MCP/CLI)
--   2. Setar os segredos RESEND_API_KEY, RESEND_FROM, DRAIN_SECRET na edge function
--   3. Substituir <DRAIN_SECRET_PLACEHOLDER> abaixo pelo valor real do DRAIN_SECRET
--
-- O Maestro executa este SQL via MCP (execute_sql) ou Supabase CLI.

-- Extensões necessárias (idempotente)
create extension if not exists pg_net  schema extensions;
create extension if not exists pg_cron schema cron;

-- Remove agendamento anterior se existir (idempotente)
select cron.unschedule('drenar-emails')
  where exists (
    select 1 from cron.job where jobname = 'drenar-emails'
  );

-- Agenda: toda minuto, chama a edge function com o segredo compartilhado
select cron.schedule(
  'drenar-emails',
  '* * * * *',
  $$
    select extensions.http_post(
      url     := 'https://vxvimnbkbfqxklebxszj.supabase.co/functions/v1/enviar-emails',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-drain-secret',  '<DRAIN_SECRET_PLACEHOLDER>'
      ),
      body    := '{}'::jsonb
    )
  $$
);
