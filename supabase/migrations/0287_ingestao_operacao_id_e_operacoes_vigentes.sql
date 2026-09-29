-- ---------------------------------------------------------------------------
-- 0287 — feat(v6.1.0/M1): `operacao_id` em Lançamentos por Operação + leitura do conjunto de
--        operações vigente (errata 4(a) e 4(c) do contrato de ingestão v1)
--
-- Classificação: ADITIVA (classificador do backup-gate: `aditiva`, sem motivos).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ, e nada mais:
--     1. `ADD COLUMN operacao_id text NULL` em `raw.lancamentos_operacao`,
--        `raw.lancamentos_operacao_staging` e `analytics.fato_lancamento_operacao`. Anulável, sem
--        default, sem índice — nenhuma linha existente é tocada (as três ficam NULL até a próxima
--        carga que trouxer a coluna).
--     2. `CREATE OR REPLACE` de `public.inserir_lote_staging_operacao(jsonb)` e
--        `public.promover_carga_operacao(jsonb, uuid)` com o corpo BYTE A BYTE o do catálogo VIVO
--        (pg_get_functiondef em 29/09/2026 — skill banco-e-rpc §5, "catálogo vivo") e só a coluna
--        nova acrescentada: na staging, `NULLIF(x->>'operacao_id', '')`; na promoção, `operacao_id`
--        nas duas listas do INSERT do raw e nas duas do INSERT do fato. MESMA assinatura (D-9 não
--        se aplica), mesmo lock, mesma idempotência, mesmos avisos.
--     3. Função NOVA `public.ingestao_operacoes_vigentes()` — somente leitura, o conjunto distinto
--        `(operacao, operacao_id)` de `analytics.fato_lancamento_operacao` (a base VIVA, já sem as
--        linhas-placeholder do scrape). É o "antes" do diff por conjunto da errata 4(c), lido pelo
--        servidor ANTES da promoção (que trunca raw e fato).
--   • COMPATÍVEL com o código em produção (v6.0.1): o adaptador de hoje não manda a chave
--     `operacao_id` ⇒ `x->>'operacao_id'` é NULL ⇒ a carga pelo card segue idêntica. Nenhum leitor
--     de tela lê a coluna (invariante 1 do briefing) — conferido no catálogo: nenhuma view/MV nem
--     função serializa a linha inteira destas tabelas (`SELECT *`/`row_to_json`); o único `*` num
--     corpo que cita o fato (`get_operacao_weddings__nucleo`) é sobre `dim_operacao_weddings`.
--   • SEGURANÇA: as duas funções alteradas mantêm dono/SECURITY DEFINER/search_path (preservados
--     pelo REPLACE) e têm REVOKE/GRANT REDECLARADOS abaixo — incluindo o EXECUTE da role `ingestor`,
--     que é a credencial que as chama (allowlist derivada, ADR-0175). A função nova nasce
--     `service_role`-only (quem a chama é `carga.ts` pelo cliente de servidor, como
--     `ingestao_soma_por_ano`); não entra na allowlist do `ingestor` nem do `verificador`.
--   • SEM `exigir_acesso` no corpo das três, POR DESENHO — são RPCs de carga, sem sessão de
--     usuário; quem autoriza é a rota /api/ingestao/{base}. Protegidas só por GRANT.
--   • NÃO FAZ: nenhum DROP, nenhum UPDATE/DELETE de dado existente, nenhuma mudança de leitor.
--
--   • LOCKS: as três ALTER TABLE pedem ACCESS EXCLUSIVE. Antes delas a migration toma o MESMO
--     advisory lock da base Operação (4017040) que `limpar_staging_operacao`/`promover_carga_operacao`
--     tomam — serializa com uma carga em voo (sem isso, promoção + migration podiam se esperar em
--     ordem cruzada e o Postgres abortaria uma das duas) — e um `lock_timeout` de 10 s para não
--     enfileirar leitores atrás de uma espera longa (achado MÉDIO do `revisor-db`).
--
-- DOWN (se precisar voltar), NESTA ORDEM: (1) as duas funções voltam aos corpos da 0285 (promover)
-- e da 0278 (staging) — que SÃO os do catálogo vivo de 29/09 menos a coluna — ANTES de qualquer
-- coisa: com o corpo novo vivo e a coluna dropada, toda promoção falha com "column does not exist";
-- (2) só então a função nova sai com DROP e as três colunas com DROP COLUMN — ambos DESTRUTIVOS, Yan
-- em TTY. E a reversão só vale com o código v6.0.1 de volta: o `carga.ts` da v6.1 lê
-- `ingestao_operacoes_vigentes` e, sem ela, recusa aplicar Operação (fail-closed, errata 4(c)).
-- ---------------------------------------------------------------------------

BEGIN;

SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(4017040); -- a chave da base Operação (ver LOCKS no header)

-- 1. As colunas -----------------------------------------------------------------------------
ALTER TABLE raw.lancamentos_operacao             ADD COLUMN IF NOT EXISTS operacao_id text;
ALTER TABLE raw.lancamentos_operacao_staging     ADD COLUMN IF NOT EXISTS operacao_id text;
ALTER TABLE analytics.fato_lancamento_operacao   ADD COLUMN IF NOT EXISTS operacao_id text;

COMMENT ON COLUMN raw.lancamentos_operacao.operacao_id IS
  'v6.1.0 (0287, errata 4(a)): Operacao_Id do CSV da RPA — o UUID estável do <select id="id"> de agency_operations no Monde. NULL quando o CSV não traz a coluna (o CSV do R). Gravado, não lido por nenhum leitor nesta versão.';
COMMENT ON COLUMN raw.lancamentos_operacao_staging.operacao_id IS
  'v6.1.0 (0287, errata 4(a)): Operacao_Id da linha da carga em curso; promovido para raw.lancamentos_operacao.';
COMMENT ON COLUMN analytics.fato_lancamento_operacao.operacao_id IS
  'v6.1.0 (0287, errata 4(a)): propagado de raw.lancamentos_operacao pela promoção. Não lido por nenhum leitor nesta versão (usar em dim_operacao_weddings é backlog — medir antes se é o operation_id da API do Monde).';

-- 2a. Staging: corpo vivo + a coluna ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inserir_lote_staging_operacao(p_linhas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO raw.lancamentos_operacao_staging (
    arquivo_origem, linha_origem, lancamento_numero, venda_numero, pessoa, descricao,
    liquidacao, vencimento, valor, operacao, tipo, operacao_id
  )
  SELECT
    x->>'arquivo_origem',
    (x->>'linha_origem')::int,
    NULLIF(x->>'lancamento_numero', ''),
    NULLIF(x->>'venda_numero', ''),
    NULLIF(x->>'pessoa', ''),
    NULLIF(x->>'descricao', ''),
    NULLIF(x->>'liquidacao', '')::date,
    NULLIF(x->>'vencimento', '')::date,
    (x->>'valor')::numeric(18,2),
    NULLIF(x->>'operacao', ''),
    NULLIF(x->>'tipo', ''),
    NULLIF(x->>'operacao_id', '')
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$function$;

REVOKE ALL ON FUNCTION public.inserir_lote_staging_operacao(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inserir_lote_staging_operacao(jsonb) TO service_role, ingestor;

-- 2b. Promoção: corpo vivo + a coluna nos dois INSERTs ---------------------------------------
CREATE OR REPLACE FUNCTION public.promover_carga_operacao(p_checksums jsonb, p_carga_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_existente   jsonb;
  v_total_stg   int;
  v_hoje        date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; -- "hoje" SP (skill banco-e-rpc §3)
  v_gravadas    int;
  v_descartadas int;
  v_sem_liq     int;
  v_ausentes    int;
  v_baseline    int := 3; -- baseline conhecido em 21/09/2026 (contrato §4) — ausência ACIMA disto é alarme
  v_avisos      text[] := '{}';
  v_result      jsonb;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_ID_OBRIGATORIO: promover_carga_operacao exige carga_id' USING ERRCODE = '22023';
  END IF;
  IF p_checksums IS NULL OR jsonb_typeof(p_checksums) <> 'array' THEN
    RAISE EXCEPTION 'CHECKSUMS_OBRIGATORIOS: promover_carga_operacao exige p_checksums (array jsonb — pode ser [], esta base não tem checksum monetário no arquivo)' USING ERRCODE = '22023';
  END IF;

  SET LOCAL lock_timeout = '10s';
  PERFORM pg_advisory_xact_lock(4017040); -- chave própria da base Operação

  SELECT resultado INTO v_existente FROM ingestao.promocao
   WHERE base = 'lancamentos-operacao' AND carga_id = p_carga_id;
  IF FOUND THEN
    RETURN v_existente;
  END IF;

  SELECT count(*) INTO v_total_stg FROM raw.lancamentos_operacao_staging;
  IF v_total_stg = 0 THEN
    RAISE EXCEPTION 'Carga abortada: staging vazia — nada a promover.';
  END IF;

  TRUNCATE raw.lancamentos_operacao RESTART IDENTITY;
  INSERT INTO raw.lancamentos_operacao (
    arquivo_origem, linha_origem, lancamento_numero, venda_numero, pessoa, descricao,
    liquidacao, vencimento, valor, operacao, tipo, operacao_id
  )
  SELECT
    arquivo_origem, linha_origem, lancamento_numero, venda_numero, pessoa, descricao,
    liquidacao, vencimento, valor, operacao, tipo, operacao_id
  FROM raw.lancamentos_operacao_staging;

  -- Esta base não tem checksum monetário no arquivo (contrato §4) — só o cruzamento de
  -- Vencimento, que é ALARME, nunca bloqueio. `vencimento` já foi resolvido pelo SERVIDOR
  -- contra Aberto/Movimentação ANTES do staging (ingestao_vencimentos_por_numero, 0276) — aqui
  -- só se CONTA o que ficou sem vencimento.
  SELECT count(*) INTO v_sem_liq
    FROM raw.lancamentos_operacao WHERE liquidacao IS NULL AND lancamento_numero IS NOT NULL;
  SELECT count(*) INTO v_ausentes
    FROM raw.lancamentos_operacao
   WHERE liquidacao IS NULL AND vencimento IS NULL AND lancamento_numero IS NOT NULL;

  IF v_ausentes > v_baseline THEN
    v_avisos := v_avisos || format(
      'ALARME cruzamento-vencimento: %s lançamento(s) sem liquidação e sem vencimento nas bases vizinhas '
      '(baseline conhecido: %s). Não bloqueia a carga — conferir a raspagem/planilhas de origem.',
      v_ausentes, v_baseline);
  END IF;

  -- Deriva o FATO a partir do raw — mesmo filtro de lancamentoOperacaoAplicavel (M4): valor,
  -- operação e tipo IN ('Entrada','Saída') são NOT NULL/CHECK em analytics.fato_lancamento_operacao.
  -- status/mes_ano/data_final são DERIVADOS aqui (anexo §6), nunca gravados no raw.
  TRUNCATE analytics.fato_lancamento_operacao;
  INSERT INTO analytics.fato_lancamento_operacao (
    lancamento_n, venda_n, pessoa, descricao, liquidacao_dt, vencimento_dt, valor, tipo,
    operacao, status, data_final, mes_ano, operacao_id
  )
  SELECT
    CASE WHEN lancamento_numero ~ '^[0-9]+$' THEN lancamento_numero::bigint END,
    CASE WHEN venda_numero ~ '^[0-9]+$' THEN venda_numero::bigint END,
    pessoa,
    descricao,
    liquidacao,
    vencimento,
    valor,
    tipo,
    operacao,
    -- Regra do R (TRUE ~ Tipo): lançamento sem data final nasce com cara de realizado — o
    -- mesmo comportamento que o durável da M4 nomeou.
    CASE
      WHEN coalesce(liquidacao, vencimento) IS NOT NULL
       AND coalesce(liquidacao, vencimento) > v_hoje
       AND tipo = 'Entrada' THEN 'A Receber Futuro'
      WHEN coalesce(liquidacao, vencimento) IS NOT NULL
       AND coalesce(liquidacao, vencimento) > v_hoje
       AND tipo = 'Saída'   THEN 'A Pagar Futuro'
      ELSE tipo
    END,
    coalesce(liquidacao, vencimento),
    CASE WHEN coalesce(liquidacao, vencimento) IS NULL THEN NULL
         ELSE to_char(coalesce(liquidacao, vencimento), 'YYYY-MM') END,
    operacao_id
  FROM raw.lancamentos_operacao
  WHERE valor IS NOT NULL AND operacao IS NOT NULL AND tipo IN ('Entrada', 'Saída');

  GET DIAGNOSTICS v_gravadas = ROW_COUNT;
  v_descartadas := v_total_stg - v_gravadas;
  IF v_descartadas > 0 THEN
    v_avisos := v_avisos || format(
      '%s linha(s) do arquivo sem operação, valor ou tipo utilizável (placeholder do scrape ou célula '
      'vazia) não foram gravadas — mesmo critério do parser de cliente anterior.', v_descartadas);
  END IF;

  PERFORM public.regenerar_dim_operacao_weddings();

  v_result := jsonb_build_object(
    'linhas', v_gravadas,
    'linhas_descartadas', v_descartadas,
    'cruzamento', jsonb_build_object(
      'sem_liquidacao', v_sem_liq, 'ausentes', v_ausentes, 'baseline_ausentes', v_baseline
    ),
    'avisos', to_jsonb(v_avisos)
  );

  INSERT INTO ingestao.promocao (base, carga_id, resultado)
  VALUES ('lancamentos-operacao', p_carga_id, v_result)
  ON CONFLICT (base, carga_id) DO NOTHING;

  TRUNCATE raw.lancamentos_operacao_staging RESTART IDENTITY;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.promover_carga_operacao(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promover_carga_operacao(jsonb, uuid) TO service_role, ingestor;

-- 3. O conjunto de operações vigente (o "antes" do diff por conjunto, errata 4(c)) ----------
CREATE OR REPLACE FUNCTION public.ingestao_operacoes_vigentes()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Lista de {operacao, operacao_id} distintos da base VIVA. O fato já é o "só linhas de
  -- lançamento" da errata 4(c): a promoção descarta as linhas-placeholder do scrape (WHERE valor/
  -- operação/tipo). A ordem é total (NULLS FIRST explícito) para a resposta ser estável.
  -- Tamanho: ~240 operações hoje — um jsonb pequeno, fora do max_rows do PostgREST.
  SELECT coalesce(
           jsonb_agg(jsonb_build_object('operacao', operacao, 'operacao_id', operacao_id)
                     ORDER BY operacao, operacao_id NULLS FIRST),
           '[]'::jsonb)
  FROM (
    SELECT DISTINCT operacao, operacao_id
    FROM analytics.fato_lancamento_operacao
  ) s;
$function$;

REVOKE ALL ON FUNCTION public.ingestao_operacoes_vigentes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingestao_operacoes_vigentes() TO service_role;

COMMENT ON FUNCTION public.ingestao_operacoes_vigentes() IS
  'v6.1.0 (0287): conjunto distinto {operacao, operacao_id} de analytics.fato_lancamento_operacao (a base VIVA, já sem placeholders) — o "antes" do diff por conjunto de operações da errata 4(c) do contrato de ingestão v1, lido por carga.ts ANTES da promoção. Nomes CRUS e pares com operacao_id nulo são possíveis (carga sem a coluna; homônimos saem como pares distintos): o consumidor normaliza nome e id e compara por id só quando os dois lados o têm. SEM exigir_acesso no corpo POR DESENHO: sem sessão de usuário — quem autoriza é a rota /api/ingestao/{base}; protegida só por GRANT, service_role-only.';

COMMIT;

NOTIFY pgrst, 'reload schema';
