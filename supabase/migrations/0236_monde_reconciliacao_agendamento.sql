-- ---------------------------------------------------------------------------
-- 0236 — feat(v5.4.4): agendamento diário da reconciliação do espelho Monde
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível com a `main` viva.
--   • Só `cron.unschedule` guardado por EXISTS + `cron.schedule` de 3 entradas NOVAS.
--   • NÃO cria, altera nem remove tabela, coluna, função ou dado. Não toca o `*/15` existente
--     (`monde-ingest-incremental`, migration 0182), que segue como está.
--   • Secrets do Vault REUSADOS (`monde_app_url`, `monde_cron_secret`) — nada de novo segredo.
--
-- ⚠️ PRÉ-CONDIÇÃO CUMPRIDA, e ela é o ponto todo desta migration existir separada da 0232:
--   o `route.ts` com `mode=reconciliacao` tem de estar EM PRODUÇÃO antes de agendar, porque o
--   cron chama a URL de produção. Agendar antes faria os 3 jobs caírem no ramo `incremental`
--   default, responderem 200 e aparecerem VERDES em `cron.job_run_details` sem reconciliar nada
--   — fabricando a falha silenciosa que a v5.4.4 existe para caçar (achado CRÍTICO do
--   revisor-db na 0232).
--   VERIFICADO antes de aplicar (PR #217 mergeado em 04/08 16h31, deploy no ar):
--     • `GET /api/monde/ingest?mode=auditoria&from=2026-08-01&to=2026-08-04` → 200 com o shape
--       novo (`diff`, `nota`): API 49 · espelho 46 · ausentes 3.
--     • `POST /api/monde/ingest?mode=reconciliacao` → 200, mês 2026-08, idempotente
--       (0 inseridas de 46 lidas), tripwire apurado: api 49 · lidas 49 · espelháveis 46 ·
--       espelho 46 · sobrando 0 · conta_fecha true ⇒ ago NÃO acende, jul/jun acendem com
--       "5 sobrando" cada. O modo funciona em produção; agora tem sentido agendá-lo.
--
-- Desenho (ADR-0164, decisões 1 e 5): a reconciliação processa UM mês por invocação, ciclando os
-- 3 últimos meses pelo cursor `reconciliacao_cursor`. Três disparos/dia fecham a janela, e cada
-- request cabe folgado no `maxDuration = 300` (medido: jul/2026, o mês mais cheio, 775 vendas).
-- Resumível por construção: falha não avança o cursor e o próximo disparo retoma o mesmo mês.
--
-- HORÁRIO: o pg_cron do Supabase agenda em UTC. 06:05/06:20/06:35 UTC = 03:05/03:20/03:35 em
-- São Paulo (sem horário de verão desde 2019, offset estável) — fora de pico. Os MINUTOS
-- (:05/:20/:35) não coincidem com os do incremental `*/15` (:00/:15/:30/:45), então o pg_cron
-- nunca dispara os dois no mesmo instante; a sobreposição por DURAÇÃO é fechada pelo lock
-- (`monde_ingest_claim`/`release`, 0232), e o incremental que encontrar o lock PULA com 200.
--
-- `timeout_milliseconds` = 320000 > `maxDuration` de 300000 da rota, de propósito: com os dois
-- iguais, uma invocação que termine rente ao limite pode ser reportada como timeout no pg_net
-- mesmo tendo concluído (ruído de observabilidade). Folga de 20s (achado MÉDIO do revisor-db).
-- ---------------------------------------------------------------------------

-- Idempotente ao reaplicar: desagenda antes, se existir.
SELECT cron.unschedule('monde-reconciliacao-1')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monde-reconciliacao-1');
SELECT cron.unschedule('monde-reconciliacao-2')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monde-reconciliacao-2');
SELECT cron.unschedule('monde-reconciliacao-3')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monde-reconciliacao-3');

SELECT cron.schedule(
  'monde-reconciliacao-1',
  '5 6 * * *',
  $cron$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_app_url')
             || '/api/monde/ingest?mode=reconciliacao',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 320000
    );
  $cron$
);

SELECT cron.schedule(
  'monde-reconciliacao-2',
  '20 6 * * *',
  $cron$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_app_url')
             || '/api/monde/ingest?mode=reconciliacao',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 320000
    );
  $cron$
);

SELECT cron.schedule(
  'monde-reconciliacao-3',
  '35 6 * * *',
  $cron$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_app_url')
             || '/api/monde/ingest?mode=reconciliacao',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 320000
    );
  $cron$
);

-- ⚠️ O bloco DOWN abaixo usa comentário de LINHA (`--`), não `/* */`, e isso é deliberado:
--    a 1ª tentativa de aplicar esta migration FALHOU porque a expressão de cron do incremental
--    contém a sequência que FECHA comentário de bloco, e escrevê-la dentro de `/* */` encerrou o
--    comentário no meio — o resto virou SQL e o push morreu com `syntax error at or near "15"`.
--    (Rollback foi limpo: a transação do `db push` desfez tudo; nenhum job criado, nada no
--    histórico.) Regra: **nunca citar expressão de cron dentro de comentário de bloco.**

-- ===========================================================================
-- DOWN (reversão explícita) — aplicar como migration NOVA para reverter.
-- Remove só o agendamento; as funções da 0232 continuam de pé e inertes, e o cron de 15 min do
-- incremental não é tocado. Reverter isto NÃO desfaz nenhuma reconciliação já corrida (os dados
-- recuperados ficam — são a foto da API), só para de reconciliar de novo.
-- ---------------------------------------------------------------------------
-- SELECT cron.unschedule('monde-reconciliacao-1');
-- SELECT cron.unschedule('monde-reconciliacao-2');
-- SELECT cron.unschedule('monde-reconciliacao-3');
-- ===========================================================================
