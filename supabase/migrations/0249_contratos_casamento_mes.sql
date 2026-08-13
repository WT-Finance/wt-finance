-- ---------------------------------------------------------------------------
-- 0249 — feat(v5.6.2): contagem de contratos de casamento por janela (espelho Monde).
--
-- ADITIVA / retrocompatível: só CREATE de RPC NOVA de leitura + REVOKE/GRANT
-- explícitos. Nenhum DROP, nenhuma escrita, nenhum objeto existente alterado —
-- a main viva não conhece esta função, então nada a consome até o front desta
-- versão chegar.
--
-- O QUE É: a barra "Meta de Assessorias" do Comparativo de Metas (Weddings)
-- precisa de quantos CONTRATOS DE CASAMENTO foram vendidos num mês arbitrário.
-- A fonte é o ESPELHO DA API MONDE (não o upload): investigação read-only de
-- 2026-08-11 provou a regra por descrição — `TRIM(produto) ILIKE 'contrato de
-- casamento%'` casa 'Contrato de casamento' (239 itens desde 2023) e a variante
-- '- venda online' (1), e exclui por construção 'Atualização de Contrato de
-- Casamento' (aditivo de contrato existente — decisão do Yan: não conta).
-- Medido: 1 item = 1 venda (239/239); COUNT(DISTINCT venda) é cinto de
-- segurança. Itens cancelados ficam fora pelo filtro NA LEITURA (status =
-- 'active' — regra da v5.4.5, o filtro de negócio mora na leitura).
--
-- ⚠️ Regra por DESCRIÇÃO em namespace de texto livre: uma variante nova de nome
-- no Monde vazaria em silêncio (investigação do de-para, 2026-08-04). Aceito
-- para este caso: o produto é único e estável, e a barra é indicativa.
--
-- RBAC: mesmas áreas de `metas_listar` (a barra vive na página de Metas) —
-- padrão INLINE (`exigir_acesso` na 1ª linha), REVOKE/GRANT explícitos (nunca
-- confiar no default — migration 0122).
--
-- Verificação pós-push: via REST/service_role (executa o corpo) —
-- shape {n_contratos:int}; jan..dez/2025 somando o total do ano; janela de mês
-- ⊆ janela do ano. Caso permanente em rpc-contrato.test.ts.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_contratos_casamento_mes(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_n int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas/acompanhamento', 'metas']);

  SELECT COUNT(DISTINCT v.id)::int
    INTO v_n
  FROM monde.venda_item vi
  JOIN monde.venda v ON v.id = vi.venda_id
  WHERE vi.status = 'active'
    AND v.setor_macro = 'Weddings'
    AND v.data_venda BETWEEN p_from AND p_to
    AND TRIM(vi.produto) ILIKE 'contrato de casamento%';

  RETURN jsonb_build_object('n_contratos', v_n);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_contratos_casamento_mes(date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_contratos_casamento_mes(date, date) TO authenticated, service_role;
