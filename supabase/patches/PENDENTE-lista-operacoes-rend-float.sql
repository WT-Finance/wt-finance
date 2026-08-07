-- ---------------------------------------------------------------------------
-- PENDENTE — feat(v5.5.0/M3): coluna `rend_float` na Lista de Operações.
--
-- ⚠️ SEM NÚMERO E FORA DE `supabase/migrations/` DE PROPÓSITO. O `db push` empurra
-- TODO o conjunto pendente da pasta, então este arquivo só entra lá no momento de
-- aplicá-lo — e recebe o número livre de então (a 0238 não reserva o seguinte).
-- Mesmo padrão que a v5.4.0 usou em `supabase/patches/`.
--
-- POR QUE ELE EXISTE: a Lista de Operações pagina no SERVIDOR e a whitelist de
-- ORDER BY termina em `ELSE 'd_data_evento'` — fallback SILENCIOSO (a armadilha
-- que a 0228 documentou). Pedir `rend_float` sem a entrada na whitelist ordenaria
-- por data do evento sem avisar ninguém. E, ao contrário da Margem a.a., o VALOR
-- não é derivável no cliente (depende da série do CDI e da composição mês a mês),
-- então `rend_float` entra TAMBÉM no payload — é a diferença de desenho para a 0228.
--
-- POR QUE ELE ESPERA: este REPLACE injeta `analytics.vw_rendimento_float_operacao`
-- (WITH RECURSIVE) na CTE `base` de uma RPC JÁ VIVA em produção, caminho principal
-- da tela de Weddings. `WITH RECURSIVE` não é inlineada pelo planner ⇒ sem pushdown
-- dos filtros ⇒ toda chamada recomputa a recursão inteira, inclusive uma busca por
-- um único casal. Mesma classe do incidente 0101 (`contar_convidados_operacao` por
-- linha), e sem Postgres local não há como medir antes do push. Achado ALTO do
-- `revisor-db` na v5.5.0.
--
-- PRÉ-CONDIÇÃO PARA APLICAR (não pular): medir, via REST/service_role contra
-- produção, o tempo de `get_rendimento_float` sem filtro (percorre a view inteira)
-- e confrontar com o teto de 8s do role `authenticated`, lembrando que a RPC da
-- Lista já paga `contar_convidados_operacao` por linha no mesmo `base`. A medição
-- decide a FORMA final:
--   • folga confortável  ⇒ aplicar como está (join direto);
--   • folga apertada     ⇒ escopar a recursão às operações que sobrevivem ao WHERE
--                          (view vira função com `p_operacoes text[]`);
--   • estouro            ⇒ materializar, aceitando que MATERIALIZED VIEW não aceita
--                          `CREATE OR REPLACE` (v5.4.5) e que toda alteração futura
--                          da métrica vira DROP+CREATE destrutivo, com humano no TTY.
-- ROLLBACK: reaplicar o corpo de `get_operacoes_weddings__nucleo` da 0228.
--
-- ⚠️ FALTA AINDA (M3): `taxa_vigente_mes` não viaja no payload desta RPC — o
-- tooltip de staleness da coluna precisa dele. Acrescentar aqui antes de aplicar,
-- ou a M3 fará uma segunda chamada só para isso. (BAIXO do `revisor-db`.)
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
        rf.rendimento                                   AS d_rend_float
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
