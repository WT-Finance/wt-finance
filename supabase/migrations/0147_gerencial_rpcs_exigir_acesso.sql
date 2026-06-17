-- ---------------------------------------------------------------------------
-- 0147 — v4.21.0 M2: hardening das RPCs de LANÇAMENTO do gerencial (fecha o M2).
--
-- DECLARAÇÃO (ADITIVA / retrocompatível): só RECRIA funções (CREATE OR REPLACE),
-- acrescentando `PERFORM app.exigir_acesso(['financeiro/gerencial'])` no topo e
-- `GRANT authenticated` (defesa em profundidade: a negação passa a valer no NÍVEL DA RPC,
-- não só na página). Não toca dado, não altera assinatura. Achado: auditoria 2026-06-13 (M2).
--
-- service_role continua com grant (caminho server-side de carga) e pula exigir_acesso pelo
-- ramo `v_role = service_role` — comportamento intencional/trusted. authenticated agora é
-- barrado se NÃO tiver a área 'financeiro/gerencial'.
-- ---------------------------------------------------------------------------

-- ── Leitura ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_gerencial_projecao_diaria(p_dias INT DEFAULT 90)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    WITH dias AS (
      SELECT generate_series(CURRENT_DATE, CURRENT_DATE + (p_dias || ' days')::INTERVAL, INTERVAL '1 day')::DATE AS data
    ),
    agregado AS (
      SELECT d.data,
        COALESCE(SUM(CASE WHEN g.tipo = 'A receber' THEN g.valor_final ELSE 0 END), 0) AS a_receber,
        COALESCE(SUM(CASE WHEN g.tipo = 'A pagar'   THEN g.valor_final ELSE 0 END), 0) AS a_pagar
      FROM dias d
      LEFT JOIN analytics.gerencial_lancamentos g ON g.vencimento = d.data
      GROUP BY d.data
    )
    SELECT json_agg(json_build_object(
      'data', to_char(data, 'YYYY-MM-DD'), 'a_receber', a_receber, 'a_pagar', a_pagar, 'resultado', a_receber - a_pagar
    ) ORDER BY data) FROM agregado
  );
END $$;

CREATE OR REPLACE FUNCTION public.get_gerencial_lancamentos(p_limit INT DEFAULT 1000)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.vencimento, t.id), '[]'::json)
    FROM (
      SELECT id, tipo, pessoa, valor_final, descricao, conta_previsao, vencimento::text AS vencimento, origem
      FROM analytics.gerencial_lancamentos LIMIT p_limit
    ) t
  );
END $$;

CREATE OR REPLACE FUNCTION public.get_gerencial_lancamentos_planilha()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT id, tipo, pessoa, valor_final, descricao, conta_previsao, vencimento::text AS vencimento
      FROM analytics.gerencial_lancamentos WHERE origem = 'planilha'
    ) t
  );
END $$;

-- ── Escrita ───────────────────────────────────────────────────────────────────
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
    SELECT id, tipo, pessoa, valor_final, descricao, conta_previsao, vencimento::text AS vencimento, origem
    FROM analytics.gerencial_lancamentos WHERE id = v_id
  ) t);
END $$;

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
    vencimento     = CASE WHEN p_updates ? 'vencimento'     THEN (p_updates->>'vencimento')::DATE     ELSE vencimento     END
  WHERE id = p_id;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.delete_gerencial_lancamento(p_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  DELETE FROM analytics.gerencial_lancamentos WHERE id = p_id;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.batch_gerencial_import(
  p_adicionar JSONB, p_remover_ids BIGINT[], p_atualizar JSONB, p_lote_id UUID, p_importado_em TIMESTAMPTZ
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item JSONB; v_adicionados INT := 0; v_removidos INT := 0; v_atualizados INT := 0;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  IF array_length(p_remover_ids, 1) IS NOT NULL THEN
    DELETE FROM analytics.gerencial_lancamentos WHERE id = ANY(p_remover_ids) AND origem = 'planilha';
    GET DIAGNOSTICS v_removidos = ROW_COUNT;
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_adicionar) LOOP
    INSERT INTO analytics.gerencial_lancamentos(tipo, pessoa, valor_final, descricao, conta_previsao, vencimento, origem, importado_em, importado_lote_id)
    VALUES (v_item->>'tipo', v_item->>'pessoa', (v_item->>'valor_final')::NUMERIC, NULLIF(v_item->>'descricao',''), NULLIF(v_item->>'conta_previsao',''), (v_item->>'vencimento')::DATE, 'planilha', p_importado_em, p_lote_id);
    v_adicionados := v_adicionados + 1;
  END LOOP;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_atualizar) LOOP
    UPDATE analytics.gerencial_lancamentos SET
      descricao      = CASE WHEN v_item ? 'descricao'      THEN NULLIF(v_item->>'descricao','')      ELSE descricao END,
      conta_previsao = CASE WHEN v_item ? 'conta_previsao' THEN NULLIF(v_item->>'conta_previsao','') ELSE conta_previsao END,
      importado_em = p_importado_em, importado_lote_id = p_lote_id
    WHERE id = (v_item->>'id')::BIGINT;
    v_atualizados := v_atualizados + 1;
  END LOOP;
  RETURN jsonb_build_object('adicionados', v_adicionados, 'removidos', v_removidos, 'atualizados', v_atualizados);
END $$;

-- ── Grants (REVOKE público/anon; GRANT authenticated + service_role) ──
REVOKE EXECUTE ON FUNCTION public.get_gerencial_projecao_diaria(INT)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_lancamentos(INT)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_lancamentos_planilha()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_gerencial_lancamento(TEXT,TEXT,NUMERIC,DATE,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_gerencial_lancamento(BIGINT,JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_gerencial_lancamento(BIGINT)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.batch_gerencial_import(JSONB,BIGINT[],JSONB,UUID,TIMESTAMPTZ) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_gerencial_projecao_diaria(INT)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_gerencial_lancamentos(INT)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_gerencial_lancamentos_planilha()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_gerencial_lancamento(TEXT,TEXT,NUMERIC,DATE,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_gerencial_lancamento(BIGINT,JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_gerencial_lancamento(BIGINT)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.batch_gerencial_import(JSONB,BIGINT[],JSONB,UUID,TIMESTAMPTZ) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
