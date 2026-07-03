-- Migration 040: pgcron job para radar-scan diário
-- Roda todos os dias às 08:00 UTC

-- Habilitar extensão pgcron (já vem habilitada no Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job: chamar função Edge via HTTP POST
-- Sintaxe: schedule('nome_job', 'cron_expression', 'comando_sql')
SELECT cron.schedule(
  'radar-scan-daily',
  '0 8 * * *',  -- Todos os dias às 08:00 UTC
  $$
    SELECT
      http_post(
        'https://' || current_setting('app.supabase_url') || '/functions/v1/radar-scan',
        '{}',
        'application/json',
        ARRAY['Authorization: Bearer ' || current_setting('app.service_role_key')]
      );
  $$
);

COMMENT ON FUNCTION cron.schedule IS
  'Radar scan diário às 08:00 UTC. Chama Edge Function radar-scan.';
