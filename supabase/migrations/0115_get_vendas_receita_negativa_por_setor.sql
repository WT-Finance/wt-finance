-- ---------------------------------------------------------------------------
-- 0115 — feat(v4.10.1): get_vendas_receita_negativa parametrizada por setor
--
-- "Receita negativa" = vendas com receita bruta < 0 na vw_vendas_agregadas
-- (conceito por VENDA Nº). A versão existente (get_vendas_prejuizo_weddings) é
-- hardcoded em setor_macro='Weddings'. Esta generaliza para aceitar p_setor,
-- habilitando o card "Vendas com Receita Negativa" também em Trips e Corporativo
-- (v4.10.1 — layout Trips/Corp no padrão Weddings). Mesmo conceito da 0114, mas
-- com janela de período (p_from/p_to).
--
-- Mesmo shape de retorno (VendasReceitaNegativa: { total, vendas[] }) — o card
-- VendasReceitaNegativaCard é reusado sem alteração. A RPC weddings antiga é
-- mantida (consumida pela aba Weddings). Grants no padrão das RPCs de UI.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_vendas_receita_negativa(
  p_setor text DEFAULT 'todos'::text,
  p_from  date DEFAULT '2020-01-01'::date,
  p_to    date DEFAULT '2099-12-31'::date
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_total  bigint;
  v_vendas jsonb;
BEGIN
  SELECT COUNT(*)
  INTO v_total
  FROM analytics.vw_vendas_agregadas
  WHERE (p_setor = 'todos' OR setor_macro = p_setor)
    AND data_venda BETWEEN p_from AND p_to
    AND receita < 0;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'venda_no',    v.venda_no,
        'data_venda',  to_char(v.data_venda, 'YYYY-MM-DD'),
        'valor_total', v.valor_total,
        'receita',     v.receita,
        'vendedor',    COALESCE(v.vendedor, '—')
      )
      ORDER BY v.receita ASC
    ),
    '[]'::jsonb
  )
  INTO v_vendas
  FROM (
    SELECT venda_no, data_venda, valor_total, receita, vendedor
    FROM analytics.vw_vendas_agregadas
    WHERE (p_setor = 'todos' OR setor_macro = p_setor)
      AND data_venda BETWEEN p_from AND p_to
      AND receita < 0
    ORDER BY receita ASC
    LIMIT 50
  ) v;

  RETURN jsonb_build_object('total', v_total, 'vendas', COALESCE(v_vendas, '[]'::jsonb));
END $function$;

REVOKE EXECUTE ON FUNCTION public.get_vendas_receita_negativa(text, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vendas_receita_negativa(text, date, date) TO anon, authenticated, service_role;
