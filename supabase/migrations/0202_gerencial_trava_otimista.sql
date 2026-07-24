-- 0202 — M5: Trava otimista no salvar da Base de Dados do Gerencial — v5.2.1/ADR-0155
--
-- TOKEN DE VERSÃO = `atualizado_em` (timestamptz) — decisão justificada: a coluna JÁ EXISTE
-- (0094) e JÁ é mantida por trigger BEFORE UPDATE (NEW.atualizado_em = now()) a cada edição;
-- portanto NÃO precisa de coluna nova (mais aditivo) e detecta qualquer alteração posterior. A
-- comparação é por INSTANTE (timestamptz), exata no round-trip via `::text` (o read devolve, o
-- cliente reenvia). Uma coluna `versao` inteira seria alternativa, mas exigiria coluna+trigger
-- novos sem ganho prático aqui.
--
-- ADITIVA: o read ganha uma COLUNA no JSON (atualizado_em); os writes ganham OVERLOADS novos com
-- o token esperado (as assinaturas antigas permanecem, retrocompatíveis — token NULL = sem trava).
-- Conflito NUNCA sobrescreve em silêncio: a guarda vai na cláusula WHERE (atômica, sem TOCTOU) e,
-- em 0 linhas, distingue "alterada por outra pessoa" de "não existe mais". Vale p/ unitário e lote.

-- ── 1. Read: expõe atualizado_em (o token que o cliente reenvia no salvar) ────────
CREATE OR REPLACE FUNCTION public.get_gerencial_lancamentos(p_limit INT DEFAULT 1000)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.vencimento, t.id), '[]'::json)
    FROM (
      SELECT id, tipo, pessoa, valor_final, descricao, conta_previsao,
             vencimento::text AS vencimento, origem, destacado, originador_nome,
             atualizado_em::text AS atualizado_em
      FROM analytics.gerencial_lancamentos LIMIT p_limit
    ) t
  );
END $$;

-- ── 2. Update com trava otimista (overload de 3 args) ────────────────────────────
-- Token NULL = sem trava (retrocompat). A guarda vive no WHERE (atômica). 0 linhas → decide se
-- foi CONFLITO (linha existe, versão outra) ou SUMIÇO (linha não existe mais).
CREATE OR REPLACE FUNCTION public.update_gerencial_lancamento(
  p_id BIGINT, p_updates JSONB, p_esperado_atualizado_em TIMESTAMPTZ
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rows INT;
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
  WHERE id = p_id
    AND (p_esperado_atualizado_em IS NULL OR atualizado_em = p_esperado_atualizado_em);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    IF EXISTS (SELECT 1 FROM analytics.gerencial_lancamentos WHERE id = p_id) THEN
      RAISE EXCEPTION 'Esta linha foi alterada por outra pessoa. Recarregue e refaça sua edição.';
    ELSE
      RAISE EXCEPTION 'Este lançamento não existe mais (foi excluído por outra pessoa). Recarregue a página.';
    END IF;
  END IF;
  RETURN TRUE;
END $$;

-- ── 3. Delete unitário com trava otimista (overload de 2 args) ───────────────────
-- Linha já ausente → idempotente (FALSE, sem erro). Versão divergente → conflito.
CREATE OR REPLACE FUNCTION public.delete_gerencial_lancamento(
  p_id BIGINT, p_esperado_atualizado_em TIMESTAMPTZ
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rows INT;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  DELETE FROM analytics.gerencial_lancamentos
   WHERE id = p_id
     AND (p_esperado_atualizado_em IS NULL OR atualizado_em = p_esperado_atualizado_em);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    IF EXISTS (SELECT 1 FROM analytics.gerencial_lancamentos WHERE id = p_id) THEN
      RAISE EXCEPTION 'Esta linha foi alterada por outra pessoa desde que você a carregou. Recarregue antes de excluir.';
    END IF;
    RETURN FALSE;  -- já não existia
  END IF;
  RETURN TRUE;
END $$;

-- ── 4. Delete em massa com trava otimista (overload com mapa de versões) ─────────
-- p_esperados = { "<id>": "<atualizado_em iso>" }. Detecta linhas AINDA existentes cuja versão
-- diverge (alteradas por outra pessoa) e ABORTA em bloco (nada é excluído). Linhas já removidas
-- por terceiros não são conflito (o alvo era removê-las). Token NULL = sem trava (retrocompat).
CREATE OR REPLACE FUNCTION public.delete_gerencial_lancamentos_bulk(
  p_ids BIGINT[], p_esperados JSONB
)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_n INT; v_conflitos INT;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN 0; END IF;
  IF p_esperados IS NOT NULL THEN
    SELECT count(*) INTO v_conflitos
    FROM analytics.gerencial_lancamentos g
    JOIN jsonb_each_text(p_esperados) e ON e.key = g.id::text
    WHERE g.id = ANY(p_ids) AND g.atualizado_em <> (e.value)::timestamptz;
    IF coalesce(v_conflitos, 0) > 0 THEN
      RAISE EXCEPTION 'Conflito: % linha(s) foram alteradas por outra pessoa desde que você carregou. Recarregue antes de excluir em massa.', v_conflitos;
    END IF;
  END IF;
  DELETE FROM analytics.gerencial_lancamentos WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ── 5. Privilégios (born-hardened: sem PUBLIC/anon; authenticated + service_role) ─
REVOKE EXECUTE ON FUNCTION public.get_gerencial_lancamentos(INT)                                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_gerencial_lancamento(BIGINT, JSONB, TIMESTAMPTZ)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_gerencial_lancamento(BIGINT, TIMESTAMPTZ)                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_gerencial_lancamentos_bulk(BIGINT[], JSONB)                      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gerencial_lancamentos(INT)                                          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.update_gerencial_lancamento(BIGINT, JSONB, TIMESTAMPTZ)                 TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.delete_gerencial_lancamento(BIGINT, TIMESTAMPTZ)                        TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.delete_gerencial_lancamentos_bulk(BIGINT[], JSONB)                      TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
