-- Migration 040: pg_cron job para radar-scan diário
-- Roda todos os dias às 08:00 UTC
-- Aplicado manualmente no banco com o service_role key real no header
-- (mesmo padrão do job publish-scheduled-posts). NÃO commitar a chave aqui.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'radar-scan-daily',
  '0 8 * * *',  -- Todos os dias às 08:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://xnwcalrlvjwszmtgkwfs.supabase.co/functions/v1/radar-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'  -- substituir ao aplicar
    ),
    body := '{}'::jsonb
  );
  $$
);
