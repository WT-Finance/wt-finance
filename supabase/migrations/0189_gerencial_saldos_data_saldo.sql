-- ---------------------------------------------------------------------------
-- 0189 — feat(gerencial): gerencial_saldos.data_saldo + saldo por conta rico (v5.2.0/M5)
--
-- ADITIVA / retrocompatível:
--   • ADD COLUMN data_saldo (anulável) — a DATA a que o saldo se refere (distinta de
--     atualizado_em = quando foi editado). Base do "staleness" (hoje − data_saldo) do
--     KPI Saldo de Caixa (M4) e do drill por conta.
--   • CREATE OR REPLACE get_gerencial_saldos__nucleo — devolve mais campos (data_saldo, papel,
--     consolidado, limite, atualizado_em) p/ o KPI/drill; chaves ANTIGAS preservadas (conta,
--     saldo, ordem) → consumidores atuais não quebram (chaves extras são ignoradas).
--   • CREATE overload update_gerencial_saldo(p_conta, p_saldo, p_data_saldo) — 3-arg ADITIVO
--     (o 2-arg permanece p/ compat; sem DROP). Grava saldo + data_saldo + atualizado_em.
--
-- Regra do modelo (§3.6): caixa operacional = total − reserva (papel='reserva', ex.: XP/Clara).
-- ---------------------------------------------------------------------------

ALTER TABLE analytics.gerencial_saldos ADD COLUMN IF NOT EXISTS data_saldo date;

-- Saldo por conta rico. IMPORTANTE: a função VIVA é get_gerencial_saldos() (inlined na 0146,
-- com exigir_acesso) — NÃO o __nucleo (código morto desde a v4.21.0/0146, sem caller). Editamos
-- a viva, adicionando data_saldo + atualizado_em (base do staleness do KPI Saldo de Caixa/M4).
-- Chaves antigas preservadas → consumidores atuais (page.tsx, gerencial/page.tsx, import route)
-- não quebram.
CREATE OR REPLACE FUNCTION public.get_gerencial_saldos()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.ordem), '[]'::json)
    FROM (
      SELECT conta, saldo, ordem, ativo, limite, consolidado, papel, data_saldo, atualizado_em
      FROM   analytics.gerencial_saldos
      WHERE  ativo = true
    ) t
  );
END $function$;

-- Overload 3-arg: grava saldo + data_saldo. Mantém o 2-arg (compat).
CREATE OR REPLACE FUNCTION public.update_gerencial_saldo(p_conta text, p_saldo numeric, p_data_saldo date)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  UPDATE analytics.gerencial_saldos
     SET saldo = p_saldo, data_saldo = p_data_saldo, atualizado_em = now()
   WHERE conta = p_conta;
  RETURN FOUND;
END $function$;

REVOKE EXECUTE ON FUNCTION public.update_gerencial_saldo(text, numeric, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_gerencial_saldo(text, numeric, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
