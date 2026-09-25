-- ---------------------------------------------------------------------------
-- 0285 — fix(v6.0.0/M9): a promoção de Lançamentos por Operação só converte para bigint o que é
--        número INTEIRO — achado da 1ª carga real (M9)
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: `CREATE OR REPLACE FUNCTION public.promover_carga_operacao(jsonb, uuid)` com o
--     corpo BYTE A BYTE o do catálogo VIVO (pg_get_functiondef em 25/09/2026, dump insumo fora do
--     repositório) e DUAS linhas trocadas, na derivação de analytics.fato_lancamento_operacao:
--         NULLIF(lancamento_numero, '')::bigint
--       → CASE WHEN lancamento_numero ~ '^[0-9]+$' THEN lancamento_numero::bigint END
--     e o mesmo para venda_numero. Nenhuma outra linha muda; raw.lancamentos_operacao continua
--     guardando o TEXTO do CSV (é ele que o cruzamento de Vencimento usa).
--   • POR QUE: a 1ª carga real de Operação pela rota nova (M9, 25/09, CSV de 21/09) morreu na
--     promoção — `invalid input syntax for type bigint: "NA"` —, base intacta. O CSV é saída do R:
--     5.185 "NA" em `Lançamento N°` e 124 em `Venda` (o parser passa a tratá-los como ausentes no
--     mesmo commit). E, corrigido o NA, a carga quebraria de novo aqui: 31 números de PARCELA do
--     Monde ("197848-2", "144778-3", …) com valor preenchido, que não cabem em bigint.
--     O caminho antigo (`toNum` no cliente) gravava VAZIO para tudo que não fosse inteiro puro —
--     é o que a produção tem hoje, e é o que esta regra reproduz.
--   • MEDIDO antes de escrever (READ ONLY, sobre a staging real que a carga recusada deixou):
--     a expressão nova sobre as 41.750 linhas grava 41.745 (as 5 placeholders "Nada para mostrar"
--     já saem pelo WHERE), com 5.371 `lancamento_n` nulos e Σ lancamento_n = 6.257.546.032 —
--     IDÊNTICOS aos de analytics.fato_lancamento_operacao hoje (41.745 · 5.371 · 6.257.546.032).
--   • `venda_n` deixa de ser vazio (124 nulos em vez de 41.745): o parser antigo lia uma coluna
--     `Venda.N.` que não existe neste CSV e nunca gravou o número da venda. O único leitor é
--     `get_pipeline_weddings__nucleo`, servido por `/api/dashboard/weddings/pipeline`, rota SEM
--     consumidor em tela (conferido no código) — nenhum número de tela muda. Registrado no
--     out-briefing: se a rota for reativada, ela passa a mostrar R$ 49,1 Mi, que não bate com os
--     R$ 48,4 Mi das outras telas (é a contaminação por venda_n que a v4.9.2 já tinha abandonado).
--   • ACL/dono/SECURITY DEFINER/search_path preservados pelo CREATE OR REPLACE (assinatura
--     idêntica). EXECUTE hoje: postgres, service_role, ingestor.
--   • Classificação: ADITIVA (só CREATE OR REPLACE de corpo de função e NOTIFY).
--   • Reversão: reaplicar o corpo vivo anterior — é este mesmo arquivo com as duas linhas de volta
--     a `NULLIF(<coluna>, '')::bigint`; a última migration que definiu o corpo antes desta é a 0278.
-- ---------------------------------------------------------------------------

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
    liquidacao, vencimento, valor, operacao, tipo
  )
  SELECT
    arquivo_origem, linha_origem, lancamento_numero, venda_numero, pessoa, descricao,
    liquidacao, vencimento, valor, operacao, tipo
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
    operacao, status, data_final, mes_ano
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
         ELSE to_char(coalesce(liquidacao, vencimento), 'YYYY-MM') END
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

NOTIFY pgrst, 'reload schema';
