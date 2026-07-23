-- ---------------------------------------------------------------------------
-- 0198 — feat(financeiro): get_saldo_repasse(p_from, p_to) — repasse do PERÍODO (v5.2.0, checkpoint)
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • CREATE FUNCTION nova, nenhum objeto existente alterado/removido;
--   • não escreve em dado pré-existente (função STABLE, só SELECT).
--
-- O card principal do Fluxo Realizado passou a exigir que o "Saldo de repasse" siga o
-- FILTRO DE PERÍODO como os demais indicadores (antes era o acumulado do ano, via
-- get_repasse_mensal, que é anual por construção). Esta RPC devolve o repasse BRUTO da
-- janela [p_from, p_to]: Σ valor das MESMAS categorias hardcoded da 0190 — entradas
-- ('Entrada de Clientes', 'Entrada de clientes', 'Deposito não Identificado') e
-- 'Pagamento ao Fornecedor' (valores assinados: sal = ent + pag) — sobre realizado
-- (eixo data_competencia = movimentação), dentro do corte. get_repasse_mensal segue
-- intocada (a Tendência da Margem continua anual).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_saldo_repasse(p_from text, p_to text)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa', 'executiva']);

  RETURN json_build_object('sal', round(COALESCE((
    SELECT SUM(f.valor)
    FROM financeiro.fato_fluxo f
    JOIN financeiro.dim_categoria dc ON dc.id = f.categoria_id
    WHERE f.tipo = 'realizado' AND NOT f.pos_corte
      AND f.data_competencia BETWEEN p_from::date AND p_to::date
      AND dc.categoria IN (
        'Entrada de Clientes', 'Entrada de clientes', 'Deposito não Identificado',
        'Pagamento ao Fornecedor'
      )
  ), 0), 2));
END $function$;

REVOKE EXECUTE ON FUNCTION public.get_saldo_repasse(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_saldo_repasse(text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
