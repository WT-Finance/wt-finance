-- ---------------------------------------------------------------------------
-- 0150 — v4.22.0 (patch, item 5): destaque PERSISTENTE por lançamento gerencial.
--
-- DECLARAÇÃO: ADITIVA / retrocompatível com a `main` viva.
--   • ADD COLUMN `destacado` BOOLEAN NOT NULL DEFAULT false — coluna nova com default
--     constante (PG 11+ não reescreve a tabela; linhas existentes nascem `false`). Não
--     escreve em dado pré-existente de forma destrutiva.
--   • CREATE OR REPLACE só ACRESCENTA `destacado` ao SELECT de leitura, ao RETURN da
--     criação e ao whitelist do update — nada removido. Privilégios são preservados no
--     REPLACE; re-GRANT explícito abaixo por convenção.
--   • NÃO toca `get_gerencial_projecao_diaria` — a Visualização Agregada ignora `destacado`
--     (e `conta_previsao`). Decisão de modelo imutável intacta.
-- ---------------------------------------------------------------------------

ALTER TABLE analytics.gerencial_lancamentos
  ADD COLUMN IF NOT EXISTS destacado BOOLEAN NOT NULL DEFAULT false;

-- Leitura: inclui `destacado`.
CREATE OR REPLACE FUNCTION public.get_gerencial_lancamentos(p_limit INT DEFAULT 1000)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.vencimento, t.id), '[]'::json)
    FROM (
      SELECT id, tipo, pessoa, valor_final, descricao, conta_previsao,
             vencimento::text AS vencimento, origem, destacado
      FROM analytics.gerencial_lancamentos LIMIT p_limit
    ) t
  );
END $$;

-- Criação: retorna `destacado` (linha nova nasce false).
CREATE OR REPLACE FUNCTION public.create_gerencial_lancamento(
  p_tipo TEXT, p_pessoa TEXT, p_valor_final NUMERIC, p_vencimento DATE,
  p_origem TEXT DEFAULT 'manual', p_descricao TEXT DEFAULT NULL, p_conta_previsao TEXT DEFAULT NULL,
  p_importado_em TIMESTAMPTZ DEFAULT NULL, p_lote_id UUID DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id BIGINT;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  INSERT INTO analytics.gerencial_lancamentos(tipo, pessoa, valor_final, vencimento, origem, descricao, conta_previsao, importado_em, importado_lote_id)
  VALUES (p_tipo, p_pessoa, p_valor_final, p_vencimento, p_origem, p_descricao, p_conta_previsao, p_importado_em, p_lote_id)
  RETURNING id INTO v_id;
  RETURN (SELECT row_to_json(t) FROM (
    SELECT id, tipo, pessoa, valor_final, descricao, conta_previsao,
           vencimento::text AS vencimento, origem, destacado
    FROM analytics.gerencial_lancamentos WHERE id = v_id
  ) t);
END $$;

-- Update: whitelist ganha `destacado` (boolean). Demais colunas inalteradas.
CREATE OR REPLACE FUNCTION public.update_gerencial_lancamento(p_id BIGINT, p_updates JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  UPDATE analytics.gerencial_lancamentos SET
    tipo           = CASE WHEN p_updates ? 'tipo'           THEN (p_updates->>'tipo')::TEXT           ELSE tipo           END,
    pessoa         = CASE WHEN p_updates ? 'pessoa'         THEN (p_updates->>'pessoa')::TEXT         ELSE pessoa         END,
    valor_final    = CASE WHEN p_updates ? 'valor_final'    THEN (p_updates->>'valor_final')::NUMERIC ELSE valor_final    END,
    descricao      = CASE WHEN p_updates ? 'descricao'      THEN (p_updates->>'descricao')::TEXT      ELSE descricao      END,
    conta_previsao = CASE WHEN p_updates ? 'conta_previsao' THEN (p_updates->>'conta_previsao')::TEXT ELSE conta_previsao END,
    vencimento     = CASE WHEN p_updates ? 'vencimento'     THEN (p_updates->>'vencimento')::DATE     ELSE vencimento     END,
    destacado      = CASE WHEN p_updates ? 'destacado'      THEN (p_updates->>'destacado')::BOOLEAN   ELSE destacado      END
  WHERE id = p_id;
  RETURN FOUND;
END $$;

-- Privilégios (explícitos por convenção; o REPLACE já os preservaria).
REVOKE EXECUTE ON FUNCTION public.get_gerencial_lancamentos(INT)                                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_gerencial_lancamento(TEXT,TEXT,NUMERIC,DATE,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_gerencial_lancamento(BIGINT,JSONB)                                          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_lancamentos(INT)                                                   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.create_gerencial_lancamento(TEXT,TEXT,NUMERIC,DATE,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.update_gerencial_lancamento(BIGINT,JSONB)                                          TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
