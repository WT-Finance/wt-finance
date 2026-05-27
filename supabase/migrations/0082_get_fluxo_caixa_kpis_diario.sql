-- 0082: RPC get_fluxo_caixa_kpis_diario
-- Retorna KPIs do Fluxo de Caixa Diário: saldo em caixa atual +
-- recebimentos e pagamentos previstos nos próximos 10 dias.

CREATE OR REPLACE FUNCTION public.get_fluxo_caixa_kpis_diario()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_saldo_em_caixa numeric;
  v_a_receber_10d  numeric;
  v_a_pagar_10d    numeric;
BEGIN
  -- Saldo em caixa: soma de todas as contas que NÃO são cartão de crédito
  SELECT COALESCE(SUM(saldo), 0)
  INTO v_saldo_em_caixa
  FROM financeiro.vw_posicao_por_conta
  WHERE tipo_conta NOT IN ('cartao_credito');

  -- A receber nos próximos 10 dias (vencimento é DATE — sem cast necessário)
  SELECT COALESCE(SUM(valor_final), 0)
  INTO v_a_receber_10d
  FROM raw.fluxo_caixa_titulos
  WHERE status = 'A Receber Futuro'
    AND vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '10 days';

  -- A pagar nos próximos 10 dias
  SELECT COALESCE(SUM(valor_final), 0)
  INTO v_a_pagar_10d
  FROM raw.fluxo_caixa_titulos
  WHERE status = 'A Pagar Futuro'
    AND vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '10 days';

  RETURN JSON_BUILD_OBJECT(
    'saldo_em_caixa', v_saldo_em_caixa,
    'a_receber_10d',  v_a_receber_10d,
    'a_pagar_10d',    v_a_pagar_10d,
    'ncg_10d',        v_a_receber_10d - v_a_pagar_10d
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_diario() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_diario() TO anon, authenticated, service_role;
