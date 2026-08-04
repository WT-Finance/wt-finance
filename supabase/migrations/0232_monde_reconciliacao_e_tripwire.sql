-- ---------------------------------------------------------------------------
-- 0232 — feat(v5.4.5/Fase1): reconciliação do espelho Monde — detector, lock e tripwire
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível com a `main` viva.
--   • CREATE de funções NOVAS (monde_vendas_ausentes, monde_ingest_claim, monde_ingest_release)
--     + CREATE OR REPLACE de monde_ingest_status (só ACRESCENTA chaves ao jsonb; nenhum campo
--     existente sai) + REVOKE/GRANT + NOTIFY. **Nenhum agendamento** — ver seção 4.
--   • NÃO altera schema/tabela/coluna/dado pré-existente. As escritas (INSERT/DELETE em
--     monde.ingest_control) vivem DENTRO de corpos de função — não há DML top-level, e a
--     tabela é a de CONTROLE da ingestão (chave/valor), nunca dado de venda.
--   • NÃO toca monde.venda / monde.venda_item / a transformação. O furo desta versão é de
--     ALCANCE, não de interpretação (invariante 1 do briefing).
--   • **INERTE ao ser aplicada:** nada no `src/` chama estas 3 funções ainda. É de propósito —
--     o agendamento (que as tornaria vivas) só entra depois do deploy do código. Ver seção 4.
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
--
-- ⚠️ INVARIANTE DO TTL (registrado a pedido do revisor-db): não há heartbeat nem fencing token,
-- então o default de 900s só é seguro porque a rota tem `maxDuration = 300` — margem de 3×.
-- **O TTL tem de ficar > 2× o maxDuration da rota.** Se uma mudança futura fizer uma invocação
-- cobrir mais de um mês por chamada (hoje é 1 mês/chamada, dentro do orçamento), ou se o
-- maxDuration subir, este número sobe junto — senão um processo genuinamente vivo tem o lock
-- expirado debaixo dele e a race reabre.
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

-- Libera o lock — COMPARE-AND-DELETE por dono (achado ALTO do revisor-db).
--
-- Um `release` incondicional (`DELETE ... WHERE chave = 'ingest_em_curso'` e nada mais) é
-- perigoso justamente no caminho fácil de escrever: um `finally` que chame `release()` SEM ter
-- checado o retorno de `claim()` libera o lock de um processo VIVO e não-expirado, reabrindo a
-- race do TRUNCATE compartilhado na hora — sem nem a margem do TTL. O advisory lock do `claim`
-- não cobre isto: ele serializa a decisão de tomar, não a de soltar.
--
-- Por isso o dono é obrigatório e comparado. `p_dono` é um token por EXECUÇÃO (a rota gera um
-- `crypto.randomUUID()` por invocação), não o nome do modo — dois ciclos do mesmo modo têm
-- tokens diferentes e não podem se soltar mutuamente.
--
-- Retorna `true` se soltou de fato. `false` significa "o lock não era meu (ou já expirou)" e é
-- informação útil para o log — nunca um erro.
CREATE OR REPLACE FUNCTION public.monde_ingest_release(p_dono text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_removidos int;
BEGIN
  DELETE FROM monde.ingest_control
  WHERE chave = 'ingest_em_curso'
    AND valor = p_dono;
  GET DIAGNOSTICS v_removidos = ROW_COUNT;
  RETURN v_removidos > 0;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_release(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_release(text) TO service_role;

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
-- 4. AGENDAMENTO — DELIBERADAMENTE FORA DESTA MIGRATION
-- ===========================================================================
-- O rascunho desta migration agendava aqui os 3 `cron.schedule` da reconciliação, apontando
-- para `POST /api/monde/ingest?mode=reconciliacao`. O revisor-db barrou, com razão:
--
--   a rota (`src/app/api/monde/ingest/route.ts`) trata `mode` em `'window'` e `'backfill'`, e
--   QUALQUER outro valor — inclusive `'reconciliacao'` — cai no ramo `incremental` default.
--   Agendar antes do deploy do código faria os 3 jobs rodarem, responderem 200 e aparecerem
--   VERDES em `cron.job_run_details` (justo o que o checkpoint do Yan manda conferir) sem
--   reconciliar nada: `reconciliacao_cursor`, `ultima_reconciliacao` e `tripwire` ficariam
--   nulos para sempre e o furo de 42 vendas / R$ 392.070,01 não fecharia. Seria FABRICAR a
--   falha silenciosa que esta versão existe para caçar. Agravante: 3 disparos extras por dia
--   com a proteção da seção 2 ainda desligada (a rota também não chama claim/release ainda)
--   aumentam a chance da race de TRUNCATE que a seção 2 existe para fechar.
--
-- As seções 1-3 são seguras isoladas porque são INERTES: nada as chama até o deploy. O
-- agendamento vive na migration `0233`, que só pode ser aplicada DEPOIS que o `route.ts` com
-- `mode=reconciliacao` estiver EM PRODUÇÃO (o cron chama a URL de produção, do Vault) — ou
-- seja, depois do merge. Por isso a `0233` não é escrita nesta pasta antes da hora: `db push`
-- empurra TODO o conjunto pendente, e ela entraria de arrasto nesta aplicação (a armadilha que
-- custou a v5.2.0).

NOTIFY pgrst, 'reload schema';

/* ===========================================================================
   DOWN (reversão explícita) — aplicar como migration NOVA para reverter.
   Remove as 3 funções novas e restaura monde_ingest_status como a 0183 a deixou (incluindo o
   `ultima_sincronizacao` com os dois marcadores). Nenhum dado de venda foi tocado por esta
   migration, então isto basta. (O agendamento não está aqui — ele é da 0233; reverter esta
   migration sem reverter a 0233 deixaria crons chamando um modo cujas funções não existem
   mais, então **reverta a 0233 primeiro**.)
   ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.monde_vendas_ausentes(text[], date, date);
DROP FUNCTION IF EXISTS public.monde_ingest_claim(int, text);
DROP FUNCTION IF EXISTS public.monde_ingest_release(text);

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
