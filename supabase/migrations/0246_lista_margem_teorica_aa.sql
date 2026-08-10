-- ---------------------------------------------------------------------------
-- 0246 — feat(v5.5.1): "Margem Teórica (a.a.)" na Lista de Operações.
--
-- ADITIVA / retrocompatível: `CREATE OR REPLACE` com assinatura IDÊNTICA (mesmos 9
-- parâmetros). Acrescenta a coluna derivada `d_margem_teorica_pct`, a chave de
-- ordenação `d_margem_teorica_aa`, a entrada `WHEN 'margem_teorica_aa'` na whitelist
-- e a chave `margem_teorica_pct` no payload. Nenhum DROP, nenhuma escrita, nenhum
-- consumidor atual afetado (`parseRpc` é tolerante e o schema tem `.passthrough()`).
--
-- O QUE É A MÉTRICA (pedido do Yan): a margem anualizada considerando o resultado
-- **mais** o rendimento potencial do float:
--     margem_teorica_pct = (resultado_caixa + rendimento_float) / faturamento × 100
--     margem_teorica_aa  = margem_teorica_pct × 12 × 30,44 ÷ duração_em_dias
--
-- ⚠️ ISTO CONTRARIA A DECISÃO 5 DO ADR-0166 ("nenhuma célula soma o float a
-- resultado, margem ou faturamento"), e é MUDANÇA DE PRODUTO deliberada, não
-- descuido. Fica registrada como **emenda datada** ao ADR-0166, não como exceção
-- silenciosa. O que sobrevive da invariante: a palavra "Teórica" no nome da coluna e
-- o tooltip dizem que o número embute um componente NÃO-contábil, e as colunas
-- contábeis (`Margem`, `Margem (a.a.)`) seguem intocadas ao lado, para comparação.
--
-- POR QUE O PERCENTUAL VIAJA NO PAYLOAD (e não só a chave de ordenação, como fez a
-- 0228 com `d_margem_aa`): o cliente PODERIA derivá-lo de
-- `resultado_caixa + rend_float / faturamento`, mas teria de ARREDONDAR — e
-- `ROUND()` do Postgres é meio-para-longe-de-zero enquanto `Math.round` do JS é
-- meio-para-cima. Nos valores NEGATIVOS (que esta métrica produz de verdade) os dois
-- discordam na 1ª casa, e a coluna passaria a exibir um número diferente do que o
-- ORDER BY usa. Arredondando uma única vez, aqui, o cliente só anualiza — reusando o
-- MESMO helper já testado da "Margem (a.a.)".
--
-- NULO quando não há float conhecido (`rf.rendimento IS NULL`): a operação não tem
-- lançamento, ou a série do CDI não tem mês fechado. Travessão, nunca zero — zero
-- afirmaria "o float não mudou a margem", que é diferente de "não sei".
--
-- Verificação pós-push: via REST/service_role — `margem_teorica_pct` ≥
-- `margem_liquida_pct` quando o float é positivo e ≤ quando é negativo; ordenar por
-- `margem_teorica_aa` asc/desc devolvendo lista monotônica; as 14 chaves anteriores
-- seguindo funcionais.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_operacoes_weddings__nucleo(p_status text DEFAULT 'todos'::text, p_periodo_inicio date DEFAULT NULL::date, p_periodo_fim date DEFAULT NULL::date, p_subsetor text DEFAULT 'todos'::text, p_busca text DEFAULT NULL::text, p_ordenar_por text DEFAULT 'data_evento'::text, p_direcao text DEFAULT 'desc'::text, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_offset     int := (GREATEST(p_pagina, 1) - 1) * LEAST(GREATEST(p_por_pagina, 1), 200);
  v_limit      int := LEAST(GREATEST(p_por_pagina, 1), 200);
  v_order_col  text;
  v_order_dir  text;
  v_operacoes  jsonb;
  v_sql        text;
BEGIN
  v_order_col := CASE p_ordenar_por
    WHEN 'nome_casal'    THEN 'd_nome_casal'
    WHEN 'hotel'         THEN 'd_hotel'
    WHEN 'faturamento'   THEN 'v_faturamento'
    WHEN 'receita'       THEN 'v_receita'
    WHEN 'margem'        THEN 'v_margem'
    WHEN 'custos'        THEN 'd_custos_internos'
    WHEN 'resultado'     THEN 'd_resultado_caixa'
    WHEN 'ml'            THEN 'd_margem_liquida'
    WHEN 'margem_aa'     THEN 'd_margem_aa'
    WHEN 'rend_float'    THEN 'd_rend_float'
    WHEN 'margem_teorica_aa' THEN 'd_margem_teorica_aa'
    WHEN 'duracao'       THEN 'd_duracao'
    WHEN 'tipo_contrato' THEN 'd_tipo_contrato'
    WHEN 'convidados'    THEN 'd_convidados'
    ELSE 'd_data_evento'
  END;
  v_order_dir := CASE WHEN lower(p_direcao) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  v_sql := $q$
    WITH vendas_op AS (
      -- v4.9.2: faturamento/receita por operacao_propria (Vendas), não venda_n.
      SELECT
        r.operacao_propria AS operacao,
        COALESCE(SUM(r.valor_total), 0) AS faturamento,
        COALESCE(SUM(r.receitas),    0) AS receita
      FROM raw.vendas_excel r
      WHERE r.operacao_propria IS NOT NULL AND r.operacao_propria <> ''
      GROUP BY r.operacao_propria
    ),
    subsetor_op AS (
      -- v4.9.2: subsetor predominante por operacao_propria (Vendas).
      SELECT DISTINCT ON (r.operacao_propria)
        r.operacao_propria AS operacao,
        COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO') AS subsetor_predominante
      FROM raw.vendas_excel r
      LEFT JOIN analytics.dim_produto_subsetor dps
             ON dps.produto_normalizado = UPPER(TRIM(r.produto))
      WHERE r.operacao_propria IS NOT NULL AND r.operacao_propria <> ''
      ORDER BY r.operacao_propria,
               SUM(COALESCE(r.valor_total, 0)) OVER (
                 PARTITION BY r.operacao_propria, COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')
               ) DESC
    ),
    tipo_contrato_cte AS (
      -- v4.9.2: tipo de contrato da linha 'Contrato de casamento' por operacao_propria.
      SELECT DISTINCT ON (v.operacao_propria)
        v.operacao_propria AS operacao,
        v.tipo_contrato
      FROM raw.vendas_excel v
      WHERE v.produto = 'Contrato de casamento'
        AND v.operacao_propria IS NOT NULL AND v.operacao_propria <> ''
      ORDER BY v.operacao_propria, v.data_venda DESC
    ),
    base AS (
      SELECT
        d.operacao                                      AS d_operacao,
        d.nome_casal                                    AS d_nome_casal,
        d.data_evento                                   AS d_data_evento,
        d.situacao                                      AS d_situacao,
        d.entradas_total                                AS d_entradas_total,
        d.saidas_total                                  AS d_saidas_total,
        d.resultado_caixa                               AS d_resultado_caixa,
        d.ncg                                           AS d_ncg,
        d.hotel                                         AS d_hotel,
        d.data_venda_contrato                           AS d_data_venda_contrato,
        tc.tipo_contrato                                AS d_tipo_contrato,
        (d.data_evento - d.data_venda_contrato)         AS d_duracao,
        public.contar_convidados_operacao(d.operacao)   AS d_convidados,
        COALESCE(v.faturamento, 0)                      AS v_faturamento,
        COALESCE(v.receita, 0)                          AS v_receita,
        CASE WHEN COALESCE(v.faturamento, 0) > 0
          THEN ROUND(v.receita / v.faturamento * 100, 1)
          ELSE 0 END                                    AS v_margem,
        -- sem GREATEST: permite negativo para sinalizar anomalia
        -- Rec. Bruta − Custos = Rec. Líq. sempre
        COALESCE(v.receita, 0) - COALESCE(d.resultado_caixa, 0)
                                                        AS d_custos_internos,
        CASE WHEN COALESCE(v.faturamento, 0) > 0
          THEN ROUND(COALESCE(d.resultado_caixa, 0) / v.faturamento * 100, 1)
          ELSE 0 END                                    AS d_margem_liquida,
        -- v5.4.2: chave de ORDENAÇÃO da Margem a.a. (linear). Espelha byte a byte a
        -- fórmula do cliente (src/lib/weddings/margem-anualizada.ts):
        --   margem_liquida_pct × 12 / (dias / 30,44)
        -- O numerador reusa a MESMA expressão de d_margem_liquida (inclusive o ROUND
        -- para 1 casa e o ELSE 0 de faturamento zero) — se as duas divergirem, a lista
        -- ordena por um número diferente do que exibe. NULL só quando a duração não é
        -- anualizável (data ausente, duração zero ou negativa): NULL nunca virá 0, e o
        -- ORDER BY já usa NULLS LAST. `30.44` é numeric, então não há divisão inteira.
        CASE WHEN (d.data_evento - d.data_venda_contrato) > 0
          THEN (CASE WHEN COALESCE(v.faturamento, 0) > 0
                  THEN ROUND(COALESCE(d.resultado_caixa, 0) / v.faturamento * 100, 1)
                  ELSE 0 END) * 12 * 30.44
               / (d.data_evento - d.data_venda_contrato)
          ELSE NULL END                                 AS d_margem_aa,
        -- v5.5.0: Rendimento potencial do float. Diferente de d_margem_aa, este
        -- valor NÃO é derivável no cliente (série do CDI + composição mês a mês),
        -- então entra também no payload. LEFT JOIN: operação sem nenhum lançamento
        -- não aparece na view e o valor fica NULL — travessão na UI, nunca zero
        -- (zero significaria "rendeu nada", que é outra afirmação).
        rf.rendimento                                   AS d_rend_float,
        -- v5.5.1: margem TEÓRICA = (resultado + float) ÷ faturamento. Espelha byte a
        -- byte a expressão de `d_margem_liquida` acima, trocando só o numerador —
        -- inclusive o `ROUND(..., 1)` e o `ELSE 0` de faturamento zero. Se as duas
        -- divergirem, a coluna nova deixa de ser comparável com a que está ao lado.
        -- NULL (não 0) quando não há float: `travessão`, porque zero afirmaria que o
        -- float não mudou a margem, e o que se sabe é que não se sabe.
        CASE WHEN rf.rendimento IS NULL THEN NULL
             WHEN COALESCE(v.faturamento, 0) > 0
               THEN ROUND((COALESCE(d.resultado_caixa, 0) + rf.rendimento) / v.faturamento * 100, 1)
             ELSE 0 END                                 AS d_margem_teorica_pct,
        -- Chave de ORDENAÇÃO: a mesma anualização LINEAR da `d_margem_aa` (ADR-0162),
        -- aplicada sobre a margem teórica. NULL quando a duração não é anualizável
        -- OU quando não há float — o ORDER BY já usa NULLS LAST.
        CASE WHEN (d.data_evento - d.data_venda_contrato) > 0 AND rf.rendimento IS NOT NULL
          THEN (CASE WHEN COALESCE(v.faturamento, 0) > 0
                  THEN ROUND((COALESCE(d.resultado_caixa, 0) + rf.rendimento) / v.faturamento * 100, 1)
                  ELSE 0 END) * 12 * 30.44
               / (d.data_evento - d.data_venda_contrato)
          ELSE NULL END                                 AS d_margem_teorica_aa
      FROM analytics.dim_operacao_weddings d
      LEFT JOIN vendas_op         v  ON v.operacao  = d.operacao
      LEFT JOIN subsetor_op       sp ON sp.operacao = d.operacao
      LEFT JOIN tipo_contrato_cte tc ON tc.operacao = d.operacao
      LEFT JOIN analytics.vw_rendimento_float_operacao rf ON rf.operacao = d.operacao
      WHERE ($1 = 'todos'  OR d.situacao = $1)
        AND ($2 IS NULL    OR d.data_evento >= $2)
        AND ($3 IS NULL    OR d.data_evento <= $3)
        AND ($4 = 'todos'  OR sp.subsetor_predominante = $4)
        AND ($5 IS NULL    OR d.nome_casal ILIKE '%' || $5 || '%')
    )
    SELECT jsonb_build_object(
      'total',      (SELECT COUNT(*) FROM base),
      'pagina',     $6,
      'por_pagina', $8,
      -- v5.5.0: último mês FECHADO do CDI. Viaja no envelope, não por linha (é o
      -- mesmo para todas), e é o que o tooltip da coluna mostra como "taxa de
      -- referência de MMM/AA" quando a série está atrasada. Sem ele a M3 faria uma
      -- segunda chamada só para descobrir isto.
      'taxa_vigente_mes', (
        SELECT to_char(MAX(mes), 'YYYY-MM-DD') FROM analytics.dim_taxa_cdi
        WHERE mes < date_trunc('month', CURRENT_DATE)::date
      ),
      'operacoes',  COALESCE(
        (SELECT jsonb_agg(row_data ORDER BY ord)
         FROM (
           SELECT
             jsonb_build_object(
               'operacao',             d_operacao,
               'nome_casal',           d_nome_casal,
               'data_evento',          d_data_evento,
               'situacao',             d_situacao,
               'faturamento',          v_faturamento,
               'receita',              v_receita,
               'margem_pct',           v_margem,
               'entradas_total',       d_entradas_total,
               'saidas_total',         d_saidas_total,
               'resultado_caixa',      d_resultado_caixa,
               'ncg',                  d_ncg,
               'hotel',                d_hotel,
               'custos_internos',      d_custos_internos,
               'margem_liquida_pct',   d_margem_liquida,
               'rend_float',           d_rend_float,
               'margem_teorica_pct',   d_margem_teorica_pct,
               'data_venda_contrato',  to_char(d_data_venda_contrato, 'YYYY-MM-DD'),
               'tipo_contrato',        d_tipo_contrato,
               'convidados',           d_convidados,
               'flags', (
                 SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
                 FROM unnest(ARRAY[
                   CASE WHEN v_margem < 0 THEN 'margem_negativa' END,
                   CASE WHEN d_ncg > 50000 THEN 'ncg_alto' END,
                   CASE WHEN v_margem > 50 OR v_margem < -20 THEN 'outlier' END
                 ]) AS f WHERE f IS NOT NULL
               )
             ) AS row_data,
             ROW_NUMBER() OVER (ORDER BY $q$ || v_order_col || $q$ $q$ || v_order_dir || $q$ NULLS LAST) AS ord
           FROM base
           LIMIT $8 OFFSET $7
         ) paged
        ),
        '[]'::jsonb
      )
    )
  $q$;

  EXECUTE v_sql
  INTO v_operacoes
  USING
    p_status, p_periodo_inicio, p_periodo_fim, p_subsetor, p_busca,
    p_pagina, v_offset, v_limit;

  RETURN v_operacoes;
END $function$;

NOTIFY pgrst, 'reload schema';
