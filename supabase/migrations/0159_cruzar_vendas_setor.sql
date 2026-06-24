-- ---------------------------------------------------------------------------
-- 0159 — feat(v4.28.0/M1): RPC cruzar_vendas_setor (Calculadora de Rateio)
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível com a `main` viva.
--   • Só CREATE de UMA função nova + REVOKE/GRANT (privilégios) + NOTIFY.
--   • NÃO altera tabela, view, coluna ou dado pré-existente; NÃO escreve dado.
--   • READ-ONLY (STABLE; só SELECT na view). Não-destrutiva → passa o backup-gate.
--
-- Para quê: a Calculadora de Rateio (Financeiro) importa uma fatura, cruza cada
-- `Venda Nº` com a base de vendas e busca o Setor Macro para ratear o valor por
-- setor. A fonte é `analytics.vw_vendas_agregadas` (migration 0040): 1 linha por
-- venda, `venda_no` (text) → `setor_macro` (text) DIRETO, sem JOIN. Como o schema
-- `analytics` NÃO é exposto pela API (config.toml só expõe public/graphql_public;
-- acesso direto dá PGRST106), o cruzamento vive numa RPC `public` SECURITY DEFINER
-- — mesmo padrão de `get_vendas_em_aberto` (0114), com o wrapper RBAC atual (0121):
-- `app.exigir_acesso(...)` + GRANT só a authenticated/service_role.
--
-- Setor único por venda: GARANTIDO (0 exceções em 27.520 vendas — auto-auditoria
-- da investigação). A view tem 1 linha por venda → no máximo 1 setor por número.
-- Eficiência: `= ANY(p_vendas)` sobre a view (~27.520 vendas) é trivial p/ ~40 nº.
--
-- Retorno: jsonb array dos pares ENCONTRADOS [{venda_no, setor_macro}, …]. Os
-- números que NÃO voltam são inferidos pela diferença no cliente → balde
-- 'Não identificado' (explícito, nunca silencioso). setor_macro usa o valor REAL
-- da base ('Lazer'); a conversão 'Lazer'→'Trips' é SÓ na camada de exibição.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cruzar_vendas_setor(p_vendas text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pares jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);   -- mesma área da aba (sem RBAC novo)

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('venda_no', v.venda_no, 'setor_macro', v.setor_macro)),
    '[]'::jsonb
  )
  INTO v_pares
  FROM analytics.vw_vendas_agregadas v
  WHERE v.venda_no = ANY(p_vendas);

  RETURN v_pares;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cruzar_vendas_setor(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cruzar_vendas_setor(text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
