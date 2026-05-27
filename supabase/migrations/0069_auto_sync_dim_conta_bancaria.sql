-- ---------------------------------------------------------------------------
-- 0069 — fix: auto-sync dim_conta_bancaria em regenerar_financeiro_lancamentos
--
-- ADR-0067: garante que novas contas do ERP sejam inseridas automaticamente
-- em dim_conta_bancaria a cada regeneração de fato_lancamentos.
-- Contas desconhecidas recebem tipo='outro', eh_cartao_credito=FALSE.
-- Contas que correspondem a padrões de cartão recebem cartao_credito=TRUE.
-- ON CONFLICT DO NOTHING preserva classificações manuais existentes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.regenerar_financeiro_lancamentos()
RETURNS TABLE (dim_cat_count int, fato_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dim_cat  int;
  v_fato     int;
BEGIN
  -- 0. Auto-sync dim_conta_bancaria: insere contas novas de raw.lancamentos
  --    Classificação conservadora: cartões conhecidos → cartao_credito/TRUE,
  --    demais → outro/FALSE. ON CONFLICT preserva classificações manuais.
  INSERT INTO financeiro.dim_conta_bancaria (conta, tipo, eh_cartao_credito)
  SELECT DISTINCT
    r.conta,
    CASE
      WHEN r.conta LIKE 'WCLARA - %'
        OR r.conta IN ('CC ASAAS', 'CCAB - AA', 'CCAB - AD', 'CCAB - VS',
                       'CCMV - MC', 'VISA WT', 'MASTERCARD WT')
        THEN 'cartao_credito'
      ELSE 'outro'
    END AS tipo,
    CASE
      WHEN r.conta LIKE 'WCLARA - %'
        OR r.conta IN ('CC ASAAS', 'CCAB - AA', 'CCAB - AD', 'CCAB - VS',
                       'CCMV - MC', 'VISA WT', 'MASTERCARD WT')
        THEN TRUE
      ELSE FALSE
    END AS eh_cartao_credito
  FROM raw.lancamentos r
  WHERE r.conta IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM financeiro.dim_conta_bancaria d WHERE d.conta = r.conta
    )
  ON CONFLICT (conta) DO NOTHING;

  -- 1. Sincroniza dim_categoria com categorias distintas do raw
  INSERT INTO financeiro.dim_categoria (categoria, grupo_categoria)
  SELECT DISTINCT
    categoria,
    COALESCE(grupo_categoria, 'Sem Grupo') AS grupo_categoria
  FROM raw.lancamentos
  WHERE categoria IS NOT NULL
  ON CONFLICT (categoria) DO UPDATE
    SET grupo_categoria = EXCLUDED.grupo_categoria;

  GET DIAGNOSTICS v_dim_cat = ROW_COUNT;

  -- 2. Reconstrói fato_lancamentos
  TRUNCATE financeiro.fato_lancamentos;

  INSERT INTO financeiro.fato_lancamentos (
    raw_id, numero, venda_no, emissao, vencimento, liquidacao,
    pessoa, descricao, valor, categoria_id, conta_bancaria_id
  )
  SELECT
    r.id,
    r.numero,
    r.venda_no,
    r.emissao,
    r.vencimento,
    r.liquidacao,
    r.pessoa,
    r.descricao,
    r.valor,
    dc.id  AS categoria_id,
    dcb.id AS conta_bancaria_id
  FROM raw.lancamentos r
  LEFT JOIN financeiro.dim_categoria      dc  ON dc.categoria = r.categoria
  LEFT JOIN financeiro.dim_conta_bancaria dcb ON dcb.conta    = r.conta;

  GET DIAGNOSTICS v_fato = ROW_COUNT;

  RETURN QUERY SELECT v_dim_cat, v_fato;
END $$;

REVOKE EXECUTE ON FUNCTION public.regenerar_financeiro_lancamentos() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.regenerar_financeiro_lancamentos() TO service_role;
