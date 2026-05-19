-- ---------------------------------------------------------------------------
-- 0038 — M5 v3.6: coluna situacao em raw.vendas_excel + RPC Vendas em Aberto
--
-- ADR-0034 (v3.6): Situação da Venda como coluna estruturada
--
-- Adiciona:
--   raw.vendas_excel          + situacao TEXT ('Aberta' | 'Fechada' | NULL)
--   public.inserir_lote_raw() — reescrita para incluir situacao
--   public.get_vendas_em_aberto_weddings(p_limite, p_offset) — lista paginada
--
-- Mitigação de risco (ADR-0034):
--   NULL é tratado como 'Aberta' pelo RPC enquanto a reimportação não ocorre.
--   Após reimportação com coluna preenchida, registros antigos sem valor são
--   corrigidos naturalmente.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Adicionar coluna situacao em raw.vendas_excel
-- ---------------------------------------------------------------------------
ALTER TABLE raw.vendas_excel
  ADD COLUMN IF NOT EXISTS situacao text
    CHECK (situacao IS NULL OR situacao IN ('Aberta', 'Fechada'));

-- ---------------------------------------------------------------------------
-- 2. Atualizar inserir_lote_raw() para incluir situacao
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
      mes,
      data_inicio_evento,
      fornecedor,
      situacao
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
      linha->>'mes',
      NULLIF(linha->>'data_inicio_evento', '')::date,
      linha->>'fornecedor',
      NULLIF(linha->>'situacao', '')
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. RPC: get_vendas_em_aberto_weddings
--
--    Lista paginada de vendas Weddings com situacao = 'Aberta' ou NULL.
--    NULL é tratado como Aberta (mitigação ADR-0034) até reimportação total.
--
--    Retorna:
--      { total: int, vendas: [{ venda_numero, data_venda, casal, produto,
--                               valor_total, idade_dias }] }
--
--    Ordenação padrão: data_venda DESC (mais recente primeiro).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vendas_em_aberto_weddings(
  p_limite  int DEFAULT 50,
  p_offset  int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total  int;
  v_vendas jsonb;
BEGIN
  -- Total de vendas abertas distintas em Weddings
  SELECT COUNT(*)
  INTO v_total
  FROM (
    SELECT DISTINCT ON (venda_numero) venda_numero
    FROM raw.vendas_excel
    WHERE setor_macro = 'Weddings'
      AND (situacao = 'Aberta' OR situacao IS NULL)
    ORDER BY venda_numero, id ASC
  ) sub;

  -- Linhas paginadas, ordenadas por data_venda DESC
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'venda_numero', sub.venda_numero,
        'data_venda',   sub.data_venda,
        'casal',        COALESCE(sub.pagante, sub.venda_numero),
        'produto',      sub.produto,
        'valor_total',  sub.valor_total,
        'idade_dias',   (CURRENT_DATE - sub.data_venda)::int
      )
      ORDER BY sub.data_venda DESC
    ),
    '[]'::jsonb
  )
  INTO v_vendas
  FROM (
    SELECT *
    FROM (
      SELECT DISTINCT ON (venda_numero)
        venda_numero, data_venda, pagante, produto, valor_total
      FROM raw.vendas_excel
      WHERE setor_macro = 'Weddings'
        AND (situacao = 'Aberta' OR situacao IS NULL)
      ORDER BY venda_numero, id ASC
    ) deduped
    ORDER BY data_venda DESC
    LIMIT p_limite OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'total',  v_total,
    'vendas', v_vendas
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_vendas_em_aberto_weddings(int, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vendas_em_aberto_weddings(int, int) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendas_em_aberto_weddings(int, int) TO service_role;
