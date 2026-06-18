-- ---------------------------------------------------------------------------
-- 0155 — v4.23.1 (item 8): lançamento adicionado MANUALMENTE nasce DESTACADO
-- (botão lata-de-tinta ligado por padrão). Carimba `destacado = (p_origem = 'manual')`
-- no INSERT de create_gerencial_lancamento.
--
-- DECLARAÇÃO: ADITIVA / retrocompatível. CREATE OR REPLACE FUNCTION SEM mudança de
-- assinatura (mesma lista de parâmetros da 0154) → preserva os GRANTs; o corpo só
-- ACRESCENTA a coluna `destacado` ao INSERT. NÃO faz DROP, NÃO escreve em dado
-- pré-existente (linhas antigas mantêm seu `destacado` atual). Não há `UPDATE`/`DELETE`.
-- O caminho de importação (batch_gerencial_import) é OUTRO e segue inserindo origem
-- 'planilha' SEM destaque — só o "+ Nova linha" (manual) nasce destacado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_gerencial_lancamento(
  p_tipo TEXT, p_pessoa TEXT, p_valor_final NUMERIC, p_vencimento DATE,
  p_origem TEXT DEFAULT 'manual', p_descricao TEXT DEFAULT NULL, p_conta_previsao TEXT DEFAULT NULL,
  p_importado_em TIMESTAMPTZ DEFAULT NULL, p_lote_id UUID DEFAULT NULL,
  p_originador_id UUID DEFAULT NULL, p_originador_nome TEXT DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id BIGINT;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  INSERT INTO analytics.gerencial_lancamentos(tipo, pessoa, valor_final, vencimento, origem, descricao, conta_previsao, importado_em, importado_lote_id, originador_id, originador_nome, destacado)
  VALUES (p_tipo, p_pessoa, p_valor_final, p_vencimento, p_origem, p_descricao, p_conta_previsao, p_importado_em, p_lote_id, p_originador_id, p_originador_nome, p_origem = 'manual')
  RETURNING id INTO v_id;
  RETURN (SELECT row_to_json(t) FROM (
    SELECT id, tipo, pessoa, valor_final, descricao, conta_previsao,
           vencimento::text AS vencimento, origem, destacado, originador_nome
    FROM analytics.gerencial_lancamentos WHERE id = v_id
  ) t);
END $$;

NOTIFY pgrst, 'reload schema';
