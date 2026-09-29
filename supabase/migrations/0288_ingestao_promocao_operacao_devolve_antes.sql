-- ---------------------------------------------------------------------------
-- 0288 — fix(v6.1.0/M2): a promoção de Operação devolve o conjunto de operações ANTES, capturado
--        sob o lock — fecha o ALTO do `revisor` (remoção silenciosa na retentativa, errata 4(c))
--
-- Classificação: ADITIVA (um CREATE OR REPLACE de mesma assinatura + REVOKE/GRANT).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: `CREATE OR REPLACE FUNCTION public.promover_carga_operacao(jsonb, uuid)` com o corpo
--     do catálogo VIVO (= o da 0287, conferido por pg_get_functiondef em 29/09/2026) e DUAS inserções:
--     (1) depois do lock 4017040 e do replay por idempotência, ANTES do TRUNCATE, captura em `v_antes`
--     o conjunto distinto {operacao, operacao_id} do fato chamando `ingestao_operacoes_vigentes()`
--     (0287) — a mesma função que a conferência lê;
--     (2) o resultado ganha a chave `operacoes_antes` com esse conjunto. Nada mais muda: mesma
--     assinatura, mesmo lock, mesmos avisos, mesmas contagens.
--   • POR QUE (achado ALTO do `revisor`, M2): o servidor lia o "antes" por RPC separada, FORA da
--     transação da promoção. Se a promoção commitasse e o processo morresse antes de alarmar (timeout
--     da função, resposta de rede perdida), a retentativa que a errata 4(e) manda a RPA fazer lia o
--     "antes" já como a base NOVA ⇒ `operacoes_removidas = []` ⇒ a carga fechava `aplicada` sem
--     alarme — a remoção silenciosa que o invariante 5 do briefing proíbe. O mesmo buraco abria com
--     duas cargas de Operação intercaladas (o lock em memória é por processo). Capturado DENTRO da
--     promoção, o "antes" é o verdadeiro por construção, e como o resultado fica em
--     `ingestao.promocao` e é devolvido no replay (`v_existente`), a retentativa o recebe intacto.
--     LIMITE (achado MÉDIO do `revisor-db`): fecha o "antes"; NÃO fecha a intercalação da STAGING —
--     `limpar → lotes → validar → promover` não fica sob lock contínuo (o 4017040 é por RPC), e duas
--     cargas de Operação intercaladas ainda poderiam promover staging misturada. Isso é anterior à
--     v6.1 e depende do lock de carga do servidor (por processo) — backlog.
--   • CUSTO: um DISTINCT sobre ~42 mil linhas dentro da transação que já trunca e recarrega o mesmo
--     fato (milissegundos); ~240 itens a mais no jsonb guardado em `ingestao.promocao` por carga.
--   • COMPATÍVEL: quem lê o resultado ganha uma chave. O código v6.0.1 em produção lê o retorno
--     campo a campo (`lerRetornoPromocao` + `lerNumeroOuNulo` em `aplicar.ts`, conferido no `main`) —
--     uma chave a mais é ignorada; `ingestao_operacoes_vigentes()`
--     (0287) continua existindo — é o "antes" da CONFERÊNCIA, que não promove.
--   • SEGURANÇA: dono/SECURITY DEFINER/search_path preservados pelo REPLACE; REVOKE/GRANT
--     redeclarados (service_role + ingestor, a ACL viva). Sem exigir_acesso POR DESENHO (RPC de carga).
--   • NÃO FAZ: nenhum DROP, nenhum UPDATE/DELETE de dado existente.
--
-- DOWN: reaplicar o corpo da 0287 (= este sem as duas inserções). Aditivo. O servidor v6.1 tolera
-- `operacoes_antes` ausente (carga nova ⇒ usa o "antes" pré-lido; retentativa ⇒ "não medido" +
-- alarme, nunca lista vazia).
--
-- ORDEM: aplicar a 0288 ANTES do merge do código v6.1 — assim nenhuma carga v6.1 promove sob a 0287.
-- ---------------------------------------------------------------------------

BEGIN;

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
  v_antes       jsonb; -- v6.1.0 (0288): o conjunto de operações ANTES, capturado sob o lock
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

  -- v6.1.0 (0288, achado ALTO do `revisor`): o conjunto {operacao, operacao_id} da base viva é
  -- capturado AQUI — sob o advisory lock e na MESMA transação que vai truncar o fato — e volta no
  -- resultado, que fica em ingestao.promocao e é devolvido no replay. Assim a comparação por
  -- conjunto da errata 4(c) enxerga o "antes" verdadeiro mesmo numa retentativa depois de um
  -- commit cujo retorno se perdeu, e mesmo com duas cargas de Operação intercaladas.
  -- FONTE ÚNICA do "antes": a mesma função que a CONFERÊNCIA lê (0287) — conferência e aplicação
  -- não podem divergir por duas cópias do mesmo SQL (achado MÉDIO do `revisor-db`). SECURITY
  -- DEFINER, roda como dono: o `ingestor` não precisa de EXECUTE nela. Em READ COMMITTED o
  -- statement tira o snapshot DEPOIS do lock acima.
  v_antes := public.ingestao_operacoes_vigentes();

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
    'avisos', to_jsonb(v_avisos),
    'operacoes_antes', v_antes
  );

  INSERT INTO ingestao.promocao (base, carga_id, resultado)
  VALUES ('lancamentos-operacao', p_carga_id, v_result)
  ON CONFLICT (base, carga_id) DO NOTHING;

  TRUNCATE raw.lancamentos_operacao_staging RESTART IDENTITY;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.promover_carga_operacao(jsonb, uuid) IS
  'v6.0.0/M5: promove a staging de Lançamentos por Operação para raw.lancamentos_operacao numa transação única e deriva analytics.fato_lancamento_operacao (status/data_final/mes_ano calculados com "hoje" de São Paulo, anexo §6). Esta base não tem checksum monetário no arquivo (contrato §4) — o cruzamento de Vencimento vira ALARME em avisos, nunca RAISE. Idempotente por (base, carga_id) via ingestao.promocao. v6.1.0: propaga operacao_id (0287) e devolve em "operacoes_antes" o conjunto de operações da base ANTES da troca, capturado sob o lock (0288) — o replay devolve o original. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

REVOKE ALL ON FUNCTION public.promover_carga_operacao(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promover_carga_operacao(jsonb, uuid) TO service_role, ingestor;

COMMIT;

NOTIFY pgrst, 'reload schema';
