-- ---------------------------------------------------------------------------
-- 0244 — feat(v5.5.0/M2): agendamento mensal da ingestão do CDI.
--
-- ADITIVA. Declaração prévia (regime do CLAUDE.md): só `cron.unschedule` (guardado
-- por EXISTS, idempotente) + `cron.schedule`, ambos via SELECT. Não cria, altera nem
-- remove objeto de dado; não escreve em nenhuma tabela do app.
--
-- ⚠️ ESTE ARQUIVO ESPEROU FORA DE `supabase/migrations/` até o deploy existir.
-- Agendar antes NÃO dá erro: o pg_net dispara, a rota inexistente responde 404, o
-- job aparece VERDE em `cron.job_run_details` e ninguém descobre que a ingestão
-- nunca rodou. É a armadilha que a v5.4.4 documentou.
--
-- ORDEM DE ATIVAÇÃO — CUMPRIDA, nesta ordem, em 07/08/2026:
--   1. ✅ migrations 0238–0243 aplicadas e verificadas;
--   2. ✅ PR #222 mergeado (`291ce6c`) e deploy no ar — `/api/cdi/ingest` responde
--        401 sem credencial (a rota existe e está protegida), não 404;
--   3. ✅ disparo MANUAL em produção com o Bearer do CRON_SECRET: HTTP 200,
--        `recebidas: 24`, `mes_max: 2026-07-01` — o último mês FECHADO, provando que
--        o descarte do mês parcial está vivo em produção;
--   4. ✅ idempotência provada na 2ª chamada (`novas: 0, alteradas: 0`, total
--        intacto) e a série RECONCILIADA mês a mês contra a API do BACEN:
--        **24 meses conferidos, 0 divergências**. (Na conferência, ago/2026 estava
--        em 0,26% no BACEN — o parcial, que havia crescido de 0,21% no mesmo dia — e
--        o Janus usando 1,22%, a taxa fechada de julho. É a prova viva de por que o
--        mês aberto não pode ser gravado.)
--   5. ⬅️ este arquivo.
--
-- ROLLBACK: `SELECT cron.unschedule('cdi-ingest-mensal');` (ver DOWN no rodapé).
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
      -- 75s, não 60s: o `maxDuration` da rota é 60, e igualar os dois números deixa
      -- zero folga para cold start + fetch do SGS. Sem margem, o job estouraria por
      -- corrida em vez de por falha real. (Achado BAIXO do `revisor-db`.)
      timeout_milliseconds := 75000
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
