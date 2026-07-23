-- ---------------------------------------------------------------------------
-- 0196 — feat(financeiro): get_fluxo_previsto_diario — série p/ horizonte dinâmico (v5.2.0, checkpoint)
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • CREATE FUNCTION nova (get_fluxo_previsto_diario), nenhum objeto existente alterado/removido;
--   • não escreve em dado pré-existente (função STABLE, só SELECT).
--
-- Alimenta o card ÚNICO de posição do Fluxo Projetado (Saldo de Caixa | A receber ·
-- A pagar · NCG com horizonte AJUSTÁVEL — slider Dias/Meses/Sempre). Em vez de uma RPC
-- por ajuste do slider, devolve a SÉRIE DIÁRIA do previsto UMA vez e o cliente soma a
-- janela (resposta instantânea):
--   • dias       = [{d:'YYYY-MM-DD', r, p}] por dia de VENCIMENTO ≥ hoje-SP, dentro do
--                  corte; r = Σ entradas (+), p = Σ magnitude das saídas (−valor) — a
--                  mesma semântica positiva do get_fluxo_caixa_kpis_diario (0188), que
--                  a página deixa de consumir mas permanece no banco.
--   • vencido_r/p = balde ÚNICO dos vencidos em aberto (venc < hoje) — entra só no
--                  horizonte "Sempre" ("todo o lançado"); as janelas Dias/Meses replicam
--                  o BETWEEN hoje..hoje+N do card antigo (vencidos fora).
-- Volume: ≤ ~900 linhas (hoje → 31/12/2028; pos_corte fora) num único JSON — longe do
-- max_rows; índice (tipo, vencimento) da 0190 cobre as duas queries.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_fluxo_previsto_diario()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_venc_r numeric;
  v_venc_p numeric;
  v_dias   json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);

  SELECT
    COALESCE(SUM(valor)  FILTER (WHERE valor > 0), 0),
    COALESCE(SUM(-valor) FILTER (WHERE valor < 0), 0)
  INTO v_venc_r, v_venc_p
  FROM financeiro.fato_fluxo
  WHERE tipo = 'previsto' AND NOT pos_corte AND vencimento < v_hoje;

  SELECT json_agg(row_to_json(t) ORDER BY t.d) INTO v_dias
  FROM (
    SELECT to_char(vencimento, 'YYYY-MM-DD') AS d,
           round(COALESCE(SUM(valor)  FILTER (WHERE valor > 0), 0), 2) AS r,
           round(COALESCE(SUM(-valor) FILTER (WHERE valor < 0), 0), 2) AS p
    FROM financeiro.fato_fluxo
    WHERE tipo = 'previsto' AND NOT pos_corte AND vencimento >= v_hoje
    GROUP BY vencimento
  ) t;

  RETURN json_build_object(
    'vencido_r', round(v_venc_r, 2),
    'vencido_p', round(v_venc_p, 2),
    'dias',      COALESCE(v_dias, '[]'::json)
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.get_fluxo_previsto_diario() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_fluxo_previsto_diario() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
