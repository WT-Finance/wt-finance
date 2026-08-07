-- ---------------------------------------------------------------------------
-- PENDENTE — feat(v5.5.0/M2): agendamento mensal da ingestão do CDI.
--
-- ⚠️ SEM NÚMERO E FORA DE `supabase/migrations/` DE PROPÓSITO — recebe o número
-- livre no momento de aplicar.
--
-- ⚠️ APLICAR SÓ DEPOIS DO DEPLOY DA ROTA `/api/cdi/ingest` EM PRODUÇÃO.
-- Agendar antes NÃO dá erro: o pg_net dispara, a rota inexistente responde 404, o
-- job aparece VERDE em `cron.job_run_details` e ninguém descobre que a ingestão
-- nunca rodou. É a armadilha que a v5.4.4 documentou, e a ordem correta que ela
-- provou é: deploy → chamar a rota À MÃO e ver o resumo → só então agendar.
--
-- ORDEM COMPLETA DE ATIVAÇÃO:
--   1. migrations 0238 e 0239 aplicadas;
--   2. deploy do código (a rota existe em produção);
--   3. disparo manual: POST /api/cdi/ingest com o Bearer do CRON_SECRET — é ele
--      que faz o BACKFILL de ago/2024 até o último mês fechado, porque a rota não
--      tem modo separado: a janela é sempre a série inteira;
--   4. conferir 3 taxas contra o site do BACEN e a idempotência (2ª chamada com
--      `novas: 0, alteradas: 0`);
--   5. aplicar este arquivo.
--
-- SECRETS: reusa `monde_app_url` e `monde_cron_secret`, já no Vault desde a 0182.
-- Os nomes citam o Monde por origem histórica, mas os VALORES são genéricos (URL de
-- produção e o CRON_SECRET do ambiente, o mesmo que a rota confere). Criar um par
-- novo só duplicaria segredo e criaria mais um pré-requisito operacional humano.
-- ---------------------------------------------------------------------------

-- Idempotente ao reaplicar.
SELECT cron.unschedule('cdi-ingest-mensal')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cdi-ingest-mensal');

-- Dia 3 de cada mês, 09:00 UTC = 06:00 em São Paulo. O dia 3 dá folga sobre a
-- publicação do fechamento do mês anterior pelo BACEN; se aquele dia falhar, nada
-- se perde de forma permanente: a janela da rota é sempre a série inteira, então o
-- mês seguinte preenche o buraco sozinho (a rotina é auto-curativa).
SELECT cron.schedule(
  'cdi-ingest-mensal',
  '0 9 3 * *',
  $cron$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_app_url')
             || '/api/cdi/ingest',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);

-- DOWN (reversão):
--   SELECT cron.unschedule('cdi-ingest-mensal');
--
-- ⚠️ O DOWN usa comentário de LINHA de propósito. Citar uma expressão de cron dentro
-- de um comentário de BLOCO fecha o comentário no meio (a sequência que o encerra
-- aparece na própria expressão) e o resto do arquivo vira SQL solto — foi o que
-- matou a 1ª tentativa da 0236, com `syntax error`.
