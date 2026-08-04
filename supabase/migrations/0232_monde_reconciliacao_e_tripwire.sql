-- ---------------------------------------------------------------------------
-- 0232 — feat(v5.4.5/Fase1): reconciliação do espelho Monde — detector, lock e tripwire
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível com a `main` viva.
--   • CREATE de funções NOVAS (monde_vendas_ausentes, monde_ingest_claim, monde_ingest_release)
--     + CREATE OR REPLACE de monde_ingest_status (só ACRESCENTA chaves ao jsonb; nenhum campo
--     existente sai) + cron.schedule de 3 entradas NOVAS + REVOKE/GRANT + NOTIFY.
--   • NÃO altera schema/tabela/coluna/dado pré-existente. As escritas (INSERT/DELETE em
--     monde.ingest_control) vivem DENTRO de corpos de função — não há DML top-level, e a
--     tabela é a de CONTROLE da ingestão (chave/valor), nunca dado de venda.
--   • NÃO toca monde.venda / monde.venda_item / a transformação. O furo desta versão é de
--     ALCANCE, não de interpretação (invariante 1 do briefing).
--
-- POR QUÊ (v5.4.5): o modo `incremental` pede à API a janela `hoje−2d..hoje` e a API filtra por
-- DATA DA VENDA. Venda registrada com atraso e data retroativa nunca cai na janela, e o
-- incremental nunca volta lá. Medido em 04/08: 42 vendas ausentes do espelho, R$ 392.070,01 de
-- faturamento — 37 de 38 registradas >2 dias após a data da venda (mediana 4, máximo 32).
-- O espelho é a fonte de produção de Metas e Performance desde a v5.1.4 (ADR-0151).
--
-- Desenho (ADR-0164, emenda a 0149/0151): janela curta frequente + reconciliação larga diária
-- (auto-curativa, não depende de acertar o tamanho de nenhuma janela) + tripwire mensal contra
-- a API — NUNCA contra o upload, que vai ficar dormente e esfriar.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. DETECTOR — o invariante permanente desta versão
-- ===========================================================================
-- Recebe os `sale_number` que a API devolveu para um range e responde quais NÃO existem no
-- espelho. É o teste de aceitação da correção e o monitor que sobrevive à aposentadoria do
-- upload: a referência é a API, não a base do Excel.
--
-- A ausência é checada por `venda_numero` SEM filtro de data de propósito: a chave é única
-- globalmente, e uma venda cuja data mudou no ERP existe no espelho com outra data — ela não
-- está "ausente", está desatualizada (caso da reconciliação, não do detector).
CREATE OR REPLACE FUNCTION public.monde_vendas_ausentes(
  p_numeros text[],
  p_from    date,
  p_to      date
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH alvo AS (
    SELECT DISTINCT n FROM unnest(COALESCE(p_numeros, '{}'::text[])) n WHERE n IS NOT NULL AND n <> ''
  ),
  faltando AS (
    SELECT a.n FROM alvo a
    WHERE NOT EXISTS (SELECT 1 FROM monde.venda v WHERE v.venda_numero = a.n)
  )
  SELECT jsonb_build_object(
    'range',          jsonb_build_object('from', to_char(p_from, 'YYYY-MM-DD'),
                                         'to',   to_char(p_to,   'YYYY-MM-DD')),
    'api',            (SELECT count(*) FROM alvo),
    'espelho',        (SELECT count(*) FROM monde.venda
                       WHERE data_venda BETWEEN p_from AND p_to),
    'ausentes_total', (SELECT count(*) FROM faltando),
    'ausentes',       COALESCE((SELECT jsonb_agg(n ORDER BY n) FROM faltando), '[]'::jsonb)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.monde_vendas_ausentes(text[], date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_vendas_ausentes(text[], date, date) TO service_role;

-- ===========================================================================
-- 2. LOCK DE INGESTÃO — invariante 2 do briefing, e não é opcional
-- ===========================================================================
-- `monde_ingest_limpar_staging` dá TRUNCATE nas tabelas de staging COMPARTILHADAS no início de
-- TODA janela. Duas ingestões sobrepostas ⇒ uma apaga as linhas da outra em pleno vôo, e as
-- vendas lidas da API nunca são promovidas: PERDA SILENCIOSA. Hoje só o cron `*/15` chama, mas
-- um ciclo que passe de 15 min já se sobrepõe — a race é PRÉ-EXISTENTE. A reconciliação diária
-- (minutos por mês) a tornaria rotina.
--
-- Por que uma LINHA de controle e não `pg_advisory_lock` puro: a janela atravessa VÁRIAS
-- chamadas HTTP (lista → detalhe → lotes → promover → refresh) sobre conexões POOLADAS do
-- PostgREST — um lock de sessão/transação não sobrevive entre elas. O advisory lock aparece
-- aqui só para tornar ATÔMICA a decisão do claim (o par "expira o velho / insere o meu").
--
-- TTL: lock preso por processo morto (timeout da Vercel, deploy no meio) expira sozinho — sem
-- ele, uma falha deixaria a ingestão parada para sempre, o que é pior que a race.
CREATE OR REPLACE FUNCTION public.monde_ingest_claim(
  p_ttl_segundos int  DEFAULT 900,
  p_dono         text DEFAULT 'ingest'
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ganhou boolean;
BEGIN
  -- Serializa a decisão: dois claims simultâneos não podem ambos ganhar.
  PERFORM pg_advisory_xact_lock(hashtext('monde.ingest_claim'));

  -- Expira lock abandonado (dono morto) antes de tentar.
  DELETE FROM monde.ingest_control
  WHERE chave = 'ingest_em_curso'
    AND atualizado_em < now() - make_interval(secs => GREATEST(p_ttl_segundos, 1));

  WITH ins AS (
    INSERT INTO monde.ingest_control (chave, valor, atualizado_em)
    VALUES ('ingest_em_curso', COALESCE(NULLIF(btrim(p_dono), ''), 'ingest'), now())
    ON CONFLICT (chave) DO NOTHING
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM ins) INTO v_ganhou;

  RETURN COALESCE(v_ganhou, false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_claim(int, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_claim(int, text) TO service_role;

-- Libera o lock. Idempotente (liberar sem ter é no-op) — o chamador chama no `finally`.
CREATE OR REPLACE FUNCTION public.monde_ingest_release()
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM monde.ingest_control WHERE chave = 'ingest_em_curso';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_release() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_release() TO service_role;

-- ===========================================================================
-- 3. STATUS — tripwire, última reconciliação, e o conserto de uma máscara futura
-- ===========================================================================
-- ⚠️ MUDANÇA DELIBERADA em `ultima_sincronizacao`: a 0183 a definiu como
-- max(atualizado_em) WHERE chave IN ('ultimo_incremental','ultimo_promover'). Como
-- `monde_ingest_promover` grava `ultimo_promover` SEMPRE que promove algo, a reconciliação
-- diária empurraria esse selo e MASCARARIA por ~45 min um incremental morto — justo o alarme de
-- `src/lib/metas/sync-atraso.ts` (3 ticks de 15 min). Estreitamos para `ultimo_incremental`, que
-- a rota grava a CADA ciclo do `*/15` mesmo sem venda nova: hoje o max() já é ele na prática
-- (promover só avança se o incremental rodou), então o rótulo de /metas NÃO muda de valor —
-- muda de garantia. A reconciliação ganha campo próprio, `ultima_reconciliacao`.
--
-- FAIL-SAFE deliberado: a leitura de `tripwire` é protegida por EXCEPTION. /metas depende desta
-- RPC para o rótulo "Última atualização" (buscarUltimaSincronizacaoMonde); um valor malformado
-- na chave de controle NÃO pode derrubar o status da tela.
CREATE OR REPLACE FUNCTION public.monde_ingest_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tripwire jsonb;
BEGIN
  BEGIN
    SELECT valor::jsonb INTO v_tripwire
    FROM monde.ingest_control WHERE chave = 'tripwire';
  EXCEPTION WHEN others THEN
    v_tripwire := NULL;
  END;

  RETURN jsonb_build_object(
    'vendas',               (SELECT count(*) FROM monde.venda),
    'itens',                (SELECT count(*) FROM monde.venda_item),
    'itens_ativos',         (SELECT count(*) FROM monde.venda_item WHERE status = 'active'),
    'min_data',             (SELECT min(data_venda) FROM monde.venda),
    'max_data',             (SELECT max(data_venda) FROM monde.venda),
    'ultima_sync',          (SELECT max(sincronizado_em) FROM monde.venda),
    -- v5.4.5: só o incremental alimenta o selo de atraso (ver bloco acima).
    'ultima_sincronizacao', (SELECT max(atualizado_em) FROM monde.ingest_control
                             WHERE chave = 'ultimo_incremental'),
    'ultima_reconciliacao', (SELECT max(atualizado_em) FROM monde.ingest_control
                             WHERE chave = 'ultima_reconciliacao'),
    'reconciliacao_cursor', (SELECT valor FROM monde.ingest_control
                             WHERE chave = 'reconciliacao_cursor'),
    'ingest_em_curso',      (SELECT jsonb_build_object('dono', valor, 'desde', atualizado_em)
                             FROM monde.ingest_control WHERE chave = 'ingest_em_curso'),
    'tripwire',             v_tripwire
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_status() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_status() TO service_role;

-- ===========================================================================
-- 4. AGENDAMENTO da reconciliação (pg_cron + pg_net, secrets do Vault já existentes)
-- ===========================================================================
-- 3 entradas, uma por mês da janela de reconciliação: cada invocação processa UM mês (cabe
-- folgado no maxDuration=300 da rota) e avança o cursor, então três disparos fecham os 3 meses.
-- Resumível por construção: se um falhar, o cursor não avança e o próximo retoma o mesmo mês.
--
-- HORÁRIO: o pg_cron do Supabase agenda em UTC. 06:05/06:20/06:35 UTC = 03:05/03:20/03:35 em
-- São Paulo — fora de pico. Os MINUTOS (:05/:20/:35) não coincidem com o `*/15` do incremental
-- (:00/:15/:30/:45); o lock da seção 2 cobre a sobreposição residual.
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
      timeout_milliseconds := 300000
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
      timeout_milliseconds := 300000
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
      timeout_milliseconds := 300000
    );
  $cron$
);

NOTIFY pgrst, 'reload schema';

/* ===========================================================================
   DOWN (reversão explícita) — aplicar como migration NOVA para reverter.
   Remove o agendamento e as 3 funções novas, e restaura monde_ingest_status como a 0183 a
   deixou (incluindo o `ultima_sincronizacao` com os dois marcadores). Nenhum dado de venda foi
   tocado por esta migration, então isto basta.
   ---------------------------------------------------------------------------
SELECT cron.unschedule('monde-reconciliacao-1');
SELECT cron.unschedule('monde-reconciliacao-2');
SELECT cron.unschedule('monde-reconciliacao-3');

DROP FUNCTION IF EXISTS public.monde_vendas_ausentes(text[], date, date);
DROP FUNCTION IF EXISTS public.monde_ingest_claim(int, text);
DROP FUNCTION IF EXISTS public.monde_ingest_release();

CREATE OR REPLACE FUNCTION public.monde_ingest_status()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'vendas',               (SELECT count(*) FROM monde.venda),
    'itens',                (SELECT count(*) FROM monde.venda_item),
    'itens_ativos',         (SELECT count(*) FROM monde.venda_item WHERE status = 'active'),
    'min_data',             (SELECT min(data_venda) FROM monde.venda),
    'max_data',             (SELECT max(data_venda) FROM monde.venda),
    'ultima_sync',          (SELECT max(sincronizado_em) FROM monde.venda),
    'ultima_sincronizacao', (SELECT max(atualizado_em) FROM monde.ingest_control
                             WHERE chave IN ('ultimo_incremental', 'ultimo_promover'))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_status() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_status() TO service_role;

-- Chaves de controle criadas pela v5.4.5 (opcional — inertes se ficarem):
DELETE FROM monde.ingest_control
 WHERE chave IN ('ingest_em_curso', 'reconciliacao_cursor', 'ultima_reconciliacao', 'tripwire');

NOTIFY pgrst, 'reload schema';
=========================================================================== */
