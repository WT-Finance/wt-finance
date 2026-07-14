-- ---------------------------------------------------------------------------
-- 0182 — feat(v5.1.4/M3): agendamento da sincronização no SUPABASE (~15min)
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA. CREATE EXTENSION + cron.schedule (via SELECT). NÃO
--   toca dado. Substitui o Cron DIÁRIO da Vercel por um pull de ~15min DENTRO do Supabase
--   (pg_cron dispara; pg_net faz o HTTP POST na rota de ingestão já existente — REUSO máximo,
--   opção (a) do briefing; a Edge Function agendada (b) foi descartada por exigir código novo
--   autocontido quando a rota idempotente já resolve).
--
-- ⚠️ APLICAÇÃO É OPERACIONAL (gate do Yan, junto do flip 0181): depende de SECRETS no Vault
--    (abaixo) e de pg_cron/pg_net habilitados no projeto. NÃO aplicar autonomamente.
--
-- Idempotência: a rota /api/monde/ingest?mode=incremental faz UPSERT por raw_hash — re-rodar
--   nunca duplica; falha de um tick, o próximo recupera; a última mv boa permanece (nunca deixa
--   o painel sem dado). CRON_SECRET autentica a chamada (mesma var que a Vercel usava).
--
-- PRÉ-REQUISITO OPERACIONAL (o Yan roda UMA vez, com os valores REAIS — nunca commitados):
--   select vault.create_secret('<CRON_SECRET>',                 'monde_cron_secret');
--   select vault.create_secret('https://<dominio-de-producao>', 'monde_app_url');
--   (se o CREATE EXTENSION abaixo falhar por preload, habilitar pg_cron/pg_net no
--    Dashboard → Database → Extensions e reaplicar.)
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agenda: a cada 15 min, POST na rota de ingestão incremental, lendo URL+secret do Vault.
-- unschedule antes (idempotente ao reaplicar a migration).
SELECT cron.unschedule('monde-ingest-incremental')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monde-ingest-incremental');

SELECT cron.schedule(
  'monde-ingest-incremental',
  '*/15 * * * *',
  $cron$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_app_url')
             || '/api/monde/ingest?mode=incremental',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);

/* ===========================================================================
   DOWN (reversão) — remove o agendamento (mantém as extensões, inofensivas):
     SELECT cron.unschedule('monde-ingest-incremental');
   Voltar ao Cron da Vercel = reativar o schedule no vercel.json (mantido como redundância).
   =========================================================================== */
