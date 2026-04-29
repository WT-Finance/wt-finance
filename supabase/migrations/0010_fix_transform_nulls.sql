-- Corrige transform_raw_to_analytics: filtra linhas com campos obrigatórios nulos
-- antes de inserir em fato_venda e fato_venda_item.

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

  -- fato_venda: filtra linhas sem data_venda, venda_numero, vendedor ou flags nulos
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
  JOIN  analytics.dim_vendedor  dv ON dv.nome = UPPER(TRIM(r.vendedor))
  LEFT JOIN analytics.dim_pagante dp ON dp.nome = TRIM(r.pagante)
  WHERE r.venda_numero  IS NOT NULL
    AND r.data_venda    IS NOT NULL
    AND r.contrato      IS NOT NULL
    AND r.taxa_servico  IS NOT NULL
  ORDER BY r.venda_numero, r.id
  ON CONFLICT (venda_numero) DO NOTHING;

  GET DIAGNOSTICS v_vendas_count = ROW_COUNT;

  -- fato_venda_item: filtra linhas sem valor_total, receitas ou dimensões nulas
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
  JOIN analytics.dim_setor_micro dsm   ON dsm.nome         = TRIM(r.setor_micro)
  WHERE r.valor_total IS NOT NULL
    AND r.receitas    IS NOT NULL;

  GET DIAGNOSTICS v_itens_count = ROW_COUNT;

  v_result := jsonb_build_object(
    'vendas_count',          v_vendas_count,
    'fato_venda_item_count', v_itens_count
  );
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transform_raw_to_analytics() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.transform_raw_to_analytics() TO service_role;
