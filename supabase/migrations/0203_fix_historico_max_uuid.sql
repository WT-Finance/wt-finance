-- 0203 — fix: histórico do Gerencial quebrava com "function max(uuid) does not exist" (v5.2.1)
--
-- ADITIVA (CREATE OR REPLACE de 2 funções; não toca dado nem schema). Postgres NÃO tem agregado
-- max()/min() para o tipo uuid. A 0200 usava `max(usuario_id)` (uuid) em gerencial_historico_lotes
-- e gerencial_desfazer_lote — só quebrava em RUNTIME (o smoke-test parou antes, no exigir_acesso).
-- Correção: `max(usuario_id::text)::uuid` — um lote é UMA transação = UM autor, então o max sobre
-- o texto devolve exatamente esse uuid (e ignora nulos de operação de sistema/importação).
-- Forward-fix sobre a 0200 já aplicada (não editamos migration aplicada).

-- ── gerencial_historico_lotes (autor do lote via max(text)::uuid) ────────────────
CREATE OR REPLACE FUNCTION public.gerencial_historico_lotes(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.criado_em DESC), '[]'::json)
    FROM (
      SELECT
        d.lote_id::text                     AS lote_id,          -- bigint → text (evita perda de precisão no JSON/JS)
        min(d.criado_em)                     AS criado_em,
        max(d.usuario_id::text)::uuid        AS usuario_id,       -- um lote = uma transação = um autor (max de uuid não existe → via text)
        max(d.usuario_nome)                  AS usuario_nome,
        count(*)                             AS n_linhas,
        array_agg(DISTINCT d.operacao ORDER BY d.operacao) AS operacoes,
        bool_or(d.origem_undo IS NOT NULL)   AS is_undo
      FROM financeiro.diario_alteracoes d
      WHERE d.tabela_alvo = 'analytics.gerencial_lancamentos'
      GROUP BY d.lote_id
      ORDER BY min(d.criado_em) DESC
      LIMIT LEAST(p_limit, 500) OFFSET GREATEST(p_offset, 0)
    ) t
  );
END $$;

-- ── gerencial_desfazer_lote (autor do lote via max(text)::uuid) ──────────────────
CREATE OR REPLACE FUNCTION public.gerencial_desfazer_lote(p_lote BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_autor uuid;
  v_n     int;
  v_rev   int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  SELECT max(usuario_id::text)::uuid, count(*) INTO v_autor, v_n
  FROM financeiro.diario_alteracoes
  WHERE lote_id = p_lote AND tabela_alvo = 'analytics.gerencial_lancamentos';
  IF v_n = 0 THEN RAISE EXCEPTION 'Lote de histórico inexistente.'; END IF;

  -- Permissão: restauração EM MASSA (>1 linha) OU ação de TERCEIRO → só admin.
  IF v_n > 1 OR v_autor IS DISTINCT FROM auth.uid() THEN
    PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  END IF;

  PERFORM set_config('app.diario_undo_de', p_lote::text, true);  -- carimba as novas entradas (undo auditado)
  SELECT financeiro.reverter_diario(
    (SELECT array_agg(id) FROM financeiro.diario_alteracoes
      WHERE lote_id = p_lote AND tabela_alvo = 'analytics.gerencial_lancamentos')
  ) INTO v_rev;

  RETURN json_build_object('revertidos', v_rev, 'total', v_n);
END $$;

REVOKE EXECUTE ON FUNCTION public.gerencial_historico_lotes(INT, INT)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gerencial_desfazer_lote(BIGINT)      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.gerencial_historico_lotes(INT, INT)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.gerencial_desfazer_lote(BIGINT)      TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
