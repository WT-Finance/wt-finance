-- ---------------------------------------------------------------------------
-- 0107 — feat(v4.9/M2): coluna operacao_propria em raw.vendas_excel
--
-- A planilha de Vendas por Produto passa a trazer a coluna "Operação Própria"
-- (vinda do ERP), contendo o NOME da operação no mesmo formato de Lançamentos
-- por Operação. Isso elimina o join frágil Vendas×Lançamentos na contagem de
-- convidados (M3) — passa a ser filtro direto por operacao_propria.
--
-- Esta migration:
--   1. ALTER TABLE raw.vendas_excel ADD COLUMN operacao_propria text.
--   2. CREATE OR REPLACE inserir_lote_raw para gravar operacao_propria.
--
-- Obs.: o dado só aparece após o Yan re-subir Vendas por Produto COM a coluna
-- (substituição total). Esta mesma versão também corrige, no parser, o header
-- da Data Início ('Data de Início' → 'Data Início') — após o re-upload, a Carteira
-- (M1) volta a ter datas reais.
-- ---------------------------------------------------------------------------

ALTER TABLE raw.vendas_excel ADD COLUMN IF NOT EXISTS operacao_propria text;

CREATE OR REPLACE FUNCTION public.inserir_lote_raw(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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
      situacao,
      tipo_contrato,
      passageiros,
      operacao_propria
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
      NULLIF(linha->>'situacao', ''),
      NULLIF(linha->>'tipo_contrato', ''),
      NULLIF(linha->>'passageiros', ''),
      NULLIF(linha->>'operacao_propria', '')
    );
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_raw(jsonb) TO service_role;
