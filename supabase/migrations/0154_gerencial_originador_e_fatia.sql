-- ---------------------------------------------------------------------------
-- 0154 — v4.23.0: coluna ORIGINADOR + captura da sessão + leitura, e preparação da
-- sincronização por fatia (ADR-0126). A LÓGICA do diff por fatia/contagem vive no app
-- (computeDiffPorFatia, testada); aqui o banco ganha o rastro de autoria e o GUARD de
-- isolamento no DELETE.
--
-- DECLARAÇÃO: ADITIVA / retrocompatível no MODELO de dados (ADD COLUMN anulável; backfill
-- = NULL/"—"). As RPCs de escrita mudam de ASSINATURA (ganham p_originador_id/nome), o que
-- exige DROP+CREATE (PostgREST resolve por nome; assinatura antiga deixaria overload
-- ambíguo). CONSUMIDORES verificados: batch_gerencial_import só na API Route de import;
-- create_gerencial_lancamento só na action createLancamento (grep em src + supabase/seed).
-- Reversível (corpos aqui). NÃO escreve em dado pré-existente (originador fica NULL nos antigos).
--
-- ⚠️ O heurístico do db-gate marca DESTRUTIVA (DROP FUNCTION + literais UPDATE/DELETE no
-- corpo) → aplicar sob CONFIRMAÇÃO HUMANA CONSCIENTE (jamais via EOF), embora seja aditiva.
--
-- ISOLAMENTO ENTRE FATIAS: o DELETE de batch_gerencial_import passa a exigir
-- `AND originador_id = p_originador_id` — uma importação NUNCA remove linha de outro
-- originador (nem linhas antigas sem originador: NULL = uuid é falso). É o backstop do banco.
-- ---------------------------------------------------------------------------

-- 1) Coluna de autoria (quem importou/criou). Backfill = NULL.
ALTER TABLE analytics.gerencial_lancamentos
  ADD COLUMN IF NOT EXISTS originador_id   UUID,
  ADD COLUMN IF NOT EXISTS originador_nome TEXT;

-- 2) Leitura da base: expõe originador_nome (coluna na UI, após Vencimento).
CREATE OR REPLACE FUNCTION public.get_gerencial_lancamentos(p_limit INT DEFAULT 1000)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.vencimento, t.id), '[]'::json)
    FROM (
      SELECT id, tipo, pessoa, valor_final, descricao, conta_previsao,
             vencimento::text AS vencimento, origem, destacado, originador_nome
      FROM analytics.gerencial_lancamentos LIMIT p_limit
    ) t
  );
END $$;

-- 3) Leitura das linhas de planilha p/ o diff: expõe originador_id (a rota escopa a fatia).
CREATE OR REPLACE FUNCTION public.get_gerencial_lancamentos_planilha()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT id, tipo, pessoa, valor_final, descricao, conta_previsao,
             vencimento::text AS vencimento, originador_id
      FROM analytics.gerencial_lancamentos WHERE origem = 'planilha'
    ) t
  );
END $$;

-- 4) Criação manual ("+ Nova linha"): captura o originador da sessão.
DROP FUNCTION IF EXISTS public.create_gerencial_lancamento(TEXT,TEXT,NUMERIC,DATE,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID);
CREATE FUNCTION public.create_gerencial_lancamento(
  p_tipo TEXT, p_pessoa TEXT, p_valor_final NUMERIC, p_vencimento DATE,
  p_origem TEXT DEFAULT 'manual', p_descricao TEXT DEFAULT NULL, p_conta_previsao TEXT DEFAULT NULL,
  p_importado_em TIMESTAMPTZ DEFAULT NULL, p_lote_id UUID DEFAULT NULL,
  p_originador_id UUID DEFAULT NULL, p_originador_nome TEXT DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id BIGINT;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  INSERT INTO analytics.gerencial_lancamentos(tipo, pessoa, valor_final, vencimento, origem, descricao, conta_previsao, importado_em, importado_lote_id, originador_id, originador_nome)
  VALUES (p_tipo, p_pessoa, p_valor_final, p_vencimento, p_origem, p_descricao, p_conta_previsao, p_importado_em, p_lote_id, p_originador_id, p_originador_nome)
  RETURNING id INTO v_id;
  RETURN (SELECT row_to_json(t) FROM (
    SELECT id, tipo, pessoa, valor_final, descricao, conta_previsao,
           vencimento::text AS vencimento, origem, destacado, originador_nome
    FROM analytics.gerencial_lancamentos WHERE id = v_id
  ) t);
END $$;

-- 5) Importação em lote: captura o originador (insere) + GUARD de isolamento (remove só DELE).
DROP FUNCTION IF EXISTS public.batch_gerencial_import(JSONB,BIGINT[],JSONB,UUID,TIMESTAMPTZ);
CREATE FUNCTION public.batch_gerencial_import(
  p_adicionar JSONB, p_remover_ids BIGINT[], p_atualizar JSONB, p_lote_id UUID, p_importado_em TIMESTAMPTZ,
  p_originador_id UUID, p_originador_nome TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item JSONB; v_adicionados INT := 0; v_removidos INT := 0; v_atualizados INT := 0; v_n INT;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  -- Remoção: SÓ dentro da fatia do importador (origem planilha + originador = ele).
  -- NUNCA toca linha de outro originador, nem linha antiga sem originador (NULL = uuid → false).
  IF array_length(p_remover_ids, 1) IS NOT NULL THEN
    DELETE FROM analytics.gerencial_lancamentos
    WHERE id = ANY(p_remover_ids) AND origem = 'planilha' AND originador_id = p_originador_id;
    GET DIAGNOSTICS v_removidos = ROW_COUNT;
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_adicionar) LOOP
    INSERT INTO analytics.gerencial_lancamentos(tipo, pessoa, valor_final, descricao, conta_previsao, vencimento, origem, importado_em, importado_lote_id, originador_id, originador_nome)
    VALUES (v_item->>'tipo', v_item->>'pessoa', (v_item->>'valor_final')::NUMERIC, NULLIF(v_item->>'descricao',''), NULLIF(v_item->>'conta_previsao',''), (v_item->>'vencimento')::DATE, 'planilha', p_importado_em, p_lote_id, p_originador_id, p_originador_nome);
    v_adicionados := v_adicionados + 1;
  END LOOP;
  -- Atualização: SÓ linhas da fatia do importador (defesa extra além do id vir do diff dele).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_atualizar) LOOP
    UPDATE analytics.gerencial_lancamentos SET
      descricao      = CASE WHEN v_item ? 'descricao'      THEN NULLIF(v_item->>'descricao','')      ELSE descricao END,
      conta_previsao = CASE WHEN v_item ? 'conta_previsao' THEN NULLIF(v_item->>'conta_previsao','') ELSE conta_previsao END,
      importado_em = p_importado_em, importado_lote_id = p_lote_id
    WHERE id = (v_item->>'id')::BIGINT AND origem = 'planilha' AND originador_id = p_originador_id;
    -- conta só o que de fato mudou (o guard de fatia pode excluir a linha → 0 linhas).
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_atualizados := v_atualizados + v_n;
  END LOOP;
  RETURN jsonb_build_object('adicionados', v_adicionados, 'removidos', v_removidos, 'atualizados', v_atualizados);
END $$;

-- 6) Grants (DROP perde privilégios; CREATE OR REPLACE preserva — re-explicitar tudo).
REVOKE EXECUTE ON FUNCTION public.get_gerencial_lancamentos(INT)                                                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_gerencial_lancamentos_planilha()                                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_gerencial_lancamento(TEXT,TEXT,NUMERIC,DATE,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID,UUID,TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.batch_gerencial_import(JSONB,BIGINT[],JSONB,UUID,TIMESTAMPTZ,UUID,TEXT)            FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_lancamentos(INT)                                                     TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_lancamentos_planilha()                                              TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.create_gerencial_lancamento(TEXT,TEXT,NUMERIC,DATE,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID,UUID,TEXT) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.batch_gerencial_import(JSONB,BIGINT[],JSONB,UUID,TIMESTAMPTZ,UUID,TEXT)            TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
