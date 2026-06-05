-- ---------------------------------------------------------------------------
-- 0114 — feat(v4.10/M6): get_vendas_em_aberto parametrizada por setor
--
-- "Vendas em aberto" = vendas com situacao = 'Aberta' na vw_vendas_agregadas
-- (conceito por VENDA, genérico — não depende da estrutura de operação de
-- Weddings). A versão existente (get_vendas_em_aberto_weddings) é hardcoded em
-- setor_macro='Weddings'. Esta generaliza para aceitar p_setor, habilitando o
-- card "Vendas em Aberto" também em Trips e Corporativo (decisão do usuário, M6).
--
-- Mesmo shape de retorno (VendasEmAberto: { total, vendas[] }) — o card
-- VendasEmAbertoCard é reusado sem alteração. A RPC weddings antiga é mantida
-- (dormente atrás do MOSTRAR_VENDAS_DIAGNOSTICO). Grants no padrão das RPCs de UI.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_vendas_em_aberto(
  p_setor  text    DEFAULT 'todos'::text,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
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
    AND situacao = 'Aberta';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'venda_no',    v.venda_no,
        'data_venda',  to_char(v.data_venda, 'YYYY-MM-DD'),
        'valor_total', v.valor_total,
        'vendedor',    COALESCE(v.vendedor, '—'),
        'idade_dias',  (CURRENT_DATE - v.data_venda)::int
      )
      ORDER BY v.data_venda DESC
    ),
    '[]'::jsonb
  )
  INTO v_vendas
  FROM (
    SELECT venda_no, data_venda, valor_total, vendedor
    FROM analytics.vw_vendas_agregadas
    WHERE (p_setor = 'todos' OR setor_macro = p_setor)
      AND situacao = 'Aberta'
    ORDER BY data_venda DESC
    LIMIT p_limite OFFSET p_offset
  ) v;

  RETURN jsonb_build_object('total', v_total, 'vendas', COALESCE(v_vendas, '[]'::jsonb));
END $function$;

REVOKE EXECUTE ON FUNCTION public.get_vendas_em_aberto(text, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vendas_em_aberto(text, integer, integer) TO anon, authenticated, service_role;
