-- Funções SECURITY DEFINER para operações privilegiadas do seed
--
-- Por que SECURITY DEFINER: estas funções permitem que lógica sensível
-- (truncate, insert em raw, transform) fique encapsulada no banco,
-- com search_path fixo para evitar ataques de substituição de schema.
--
-- Modelo de permissão: REVOKE de PUBLIC + GRANT apenas a service_role.

-- ---------------------------------------------------------------------------
-- 1. truncate_dynamic_tables()
--    Limpa todas as tabelas recarregadas a cada seed, preservando
--    dim_setor_macro, dim_setor, dim_setor_micro, dim_data e audit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.truncate_dynamic_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  TRUNCATE
    analytics.fato_venda_item,
    analytics.fato_venda,
    analytics.dim_produto,
    analytics.dim_pagante,
    analytics.dim_vendedor,
    raw.vendas_excel,
    app.meta_setor
  RESTART IDENTITY CASCADE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.truncate_dynamic_tables() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.truncate_dynamic_tables() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. inserir_lote_raw(p_linhas jsonb)
--    Recebe um array JSON com linhas do Excel e insere em raw.vendas_excel.
--    Conversões de tipo acontecem aqui para manter o TypeScript simples.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inserir_lote_raw(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linha jsonb;
BEGIN
  FOR linha IN SELECT jsonb_array_elements(p_linhas)
  LOOP
    INSERT INTO raw.vendas_excel (
      arquivo_origem,
      linha_origem,
      venda_numero,
      data_venda,
      vendedor,
      pagante,
      setor_macro,
      setor,
      setor_micro,
      produto,
      valor_total,
      receitas,
      contrato,
      taxa_servico,
      semana,
      mes
    ) VALUES (
      linha->>'arquivo_origem',
      (linha->>'linha_origem')::int,
      linha->>'venda_numero',
      (linha->>'data_venda')::date,
      linha->>'vendedor',
      linha->>'pagante',
      linha->>'setor_macro',
      linha->>'setor',
      linha->>'setor_micro',
      linha->>'produto',
      (linha->>'valor_total')::numeric,
      (linha->>'receitas')::numeric,
      (linha->>'contrato')::boolean,
      (linha->>'taxa_servico')::boolean,
      NULLIF(linha->>'semana', '')::int,
      linha->>'mes'
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. transform_raw_to_analytics()
--    Popula as dimensões e tabelas fato a partir de raw.vendas_excel.
--    Nomes de vendedor são normalizados via UPPER+TRIM para deduplicação.
--    Retorna objeto JSON com contagens para o log de auditoria.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transform_raw_to_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_itens_count   int;
  v_vendas_count  int;
  v_result        jsonb;
BEGIN
  -- dim_vendedor: armazena UPPER(TRIM()) para deduplicação case-insensitive
  INSERT INTO analytics.dim_vendedor (nome)
  SELECT DISTINCT UPPER(TRIM(vendedor))
  FROM raw.vendas_excel
  WHERE vendedor IS NOT NULL AND TRIM(vendedor) <> ''
  ON CONFLICT (nome) DO NOTHING;

  -- dim_pagante: deduplicação por nome trimado
  INSERT INTO analytics.dim_pagante (nome)
  SELECT DISTINCT TRIM(pagante)
  FROM raw.vendas_excel
  WHERE pagante IS NOT NULL AND TRIM(pagante) <> ''
  ON CONFLICT (nome) DO NOTHING;

  -- dim_produto: deduplicação por nome trimado
  INSERT INTO analytics.dim_produto (nome)
  SELECT DISTINCT TRIM(produto)
  FROM raw.vendas_excel
  WHERE produto IS NOT NULL AND TRIM(produto) <> ''
  ON CONFLICT (nome) DO NOTHING;

  -- fato_venda: uma linha por venda_numero único
  -- Em caso de duplicatas no raw (mesmo número em arquivos diferentes),
  -- usa a primeira ocorrência por id de raw
  INSERT INTO analytics.fato_venda (
    venda_numero, data_venda, vendedor_id, pagante_id, contrato, taxa_servico
  )
  SELECT DISTINCT ON (r.venda_numero)
    r.venda_numero,
    r.data_venda,
    dv.id,
    dp.id,
    r.contrato,
    r.taxa_servico
  FROM raw.vendas_excel r
  JOIN analytics.dim_vendedor  dv ON dv.nome = UPPER(TRIM(r.vendedor))
  LEFT JOIN analytics.dim_pagante dp ON dp.nome = TRIM(r.pagante)
  ORDER BY r.venda_numero, r.id
  ON CONFLICT (venda_numero) DO NOTHING;

  GET DIAGNOSTICS v_vendas_count = ROW_COUNT;

  -- fato_venda_item: uma linha por produto por venda
  INSERT INTO analytics.fato_venda_item (
    fato_venda_id, produto_id, setor_id, setor_micro_id, valor_total, receitas
  )
  SELECT
    fv.id,
    dprod.id,
    ds.id,
    dsm.id,
    r.valor_total,
    r.receitas
  FROM raw.vendas_excel r
  JOIN analytics.fato_venda      fv    ON fv.venda_numero = r.venda_numero
  JOIN analytics.dim_produto     dprod ON dprod.nome       = TRIM(r.produto)
  JOIN analytics.dim_setor       ds    ON ds.nome          = TRIM(r.setor)
  JOIN analytics.dim_setor_micro dsm   ON dsm.nome         = TRIM(r.setor_micro);

  GET DIAGNOSTICS v_itens_count = ROW_COUNT;

  v_result := jsonb_build_object(
    'vendas_count',       v_vendas_count,
    'fato_venda_item_count', v_itens_count
  );
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transform_raw_to_analytics() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.transform_raw_to_analytics() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. refresh_all_materialized_views()
--    Atualiza as 4 views materializadas. Chamado ao final do seed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_all_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW analytics.mv_vendas_diarias;
  REFRESH MATERIALIZED VIEW analytics.mv_vendas_mensais;
  REFRESH MATERIALIZED VIEW analytics.mv_ranking_vendedores_mensal;
  REFRESH MATERIALIZED VIEW analytics.mv_ranking_produtos_mensal;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_all_materialized_views() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.refresh_all_materialized_views() TO service_role;

-- ---------------------------------------------------------------------------
-- 5. registrar_ingestao_log(p_fonte, p_status, p_registros, p_erro)
--    Insere uma linha em audit.ingestao_log sem expor o schema audit via REST.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_ingestao_log(
  p_fonte       text,
  p_status      text,
  p_registros   int     DEFAULT NULL,
  p_erro        text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO audit.ingestao_log (
    fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem
  ) VALUES (
    p_fonte,
    now(),
    now(),
    p_status,
    p_registros,
    p_erro
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_ingestao_log(text, text, int, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_ingestao_log(text, text, int, text) TO service_role;
